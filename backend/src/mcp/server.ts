import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EXTENSION_ID, registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';

import { getDocument, getDocumentTitle, type GoogleClients } from '../services/google-docs.js';
import { getUser, updateUserSettings, type UserSettings } from '../services/user-store.js';

const CV_FUNCTION_NAME = process.env.CV_FUNCTION_NAME || '';
import { optimizeCv } from '../services/cv-optimizer.js';
import { sessionStore } from './session-store.js';
import { settingsAppHtml } from './settings-app.js';

const API_URL = process.env.API_URL || '';
const CV_AUTH_FUNCTION_NAME = process.env.CV_AUTH_FUNCTION_NAME || '';
const lambdaClient = new LambdaClient({});
const CONTEXT_DOC_ID = process.env.CONTEXT_DOC_ID || '';
const INSTRUCTIONS_DOC_ID = process.env.INSTRUCTIONS_DOC_ID || '';
const FRONTEND_URL = process.env.FRONTEND_URL || '';

function replacePlaceholders(text: string): string {
  const replacements: Record<string, string> = {
    '{{API_URL}}': API_URL,
    '{{CONTEXT_DOC_ID}}': CONTEXT_DOC_ID,
    '{{INSTRUCTIONS_DOC_ID}}': INSTRUCTIONS_DOC_ID,
  };
  let result = text;
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.split(placeholder).join(value);
  }
  return result;
}

export function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

export function errorResult(status: number, error: string) {
  return { content: [{ type: 'text' as const, text: `Error (${status}): ${error}` }], isError: true };
}

async function invokeCvLambda(
  templateDocId: string,
  data: Record<string, unknown>,
  userToken?: string,
): Promise<{ documentId: string; url: string }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (userToken) headers.authorization = `Bearer ${userToken}`;

  const functionName = userToken ? CV_AUTH_FUNCTION_NAME : CV_FUNCTION_NAME;
  if (!functionName) throw new Error('No CV Lambda function configured');

  const payload = JSON.stringify({
    rawPath: '/cv/generate',
    requestContext: { http: { method: 'POST' }, domainName: 'lambda.internal', accountId: '', apiId: '', requestId: '', routeKey: '', stage: '', time: '', timeEpoch: 0 },
    body: JSON.stringify({ templateDocId, data }),
    isBase64Encoded: false,
    headers,
  });

  const result = await lambdaClient.send(new InvokeCommand({
    FunctionName: functionName,
    Payload: new TextEncoder().encode(payload),
  }));

  const responsePayload = JSON.parse(new TextDecoder().decode(result.Payload));
  const body = JSON.parse(responsePayload.body) as {
    documentId?: string; filename?: string; created?: boolean; error?: string;
  };

  if (responsePayload.statusCode !== 200) {
    throw new Error(body.error || JSON.stringify(body));
  }

  const documentId = body.documentId!;
  return { documentId, url: `https://docs.google.com/document/d/${documentId}` };
}

export interface McpServerOptions {
  clients?: GoogleClients;
  userToken?: string;
  userSettings?: UserSettings;
  userId?: string;
}

export function createServer(options: McpServerOptions = {}): McpServer {
  const { clients, userToken, userSettings, userId } = options;

  const server = new McpServer(
    { name: 'prompt-cv', version: '2.4.0' },
    { capabilities: { extensions: { [EXTENSION_ID]: {} } } as Record<string, unknown> },
  );

  // --- General ---

  server.tool(
    'get_doc_content',
    'Retrieve plain text content of Google Docs. Accepts a single ID or an array of IDs for batch fetching.',
    {
      documentId: z.union([
        z.string(),
        z.array(z.string()),
      ]).describe('Single Google Docs document ID or array of IDs'),
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ documentId }) => {
      try {
        if (Array.isArray(documentId)) {
          const docs = await Promise.all(documentId.map(id => getDocument(id, clients)));
          const result: Record<string, string> = {};
          documentId.forEach((id, i) => { result[id] = docs[i].content; });
          return textResult(JSON.stringify(result));
        }
        const doc = await getDocument(documentId, clients);
        return textResult(doc.content);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        if (msg.includes('403') || msg.includes('forbidden') || msg.includes('insufficient')) {
          return errorResult(403, `Access denied for document ${Array.isArray(documentId) ? documentId.join(', ') : documentId}. The user may need to grant "View your Google Drive files" permission in Security settings, or share the document with the app.`);
        }
        return errorResult(500, msg);
      }
    },
  );

  // --- CV Session Pipeline ---

  server.tool(
    'get_cv_instructions',
    'Start a new CV generation session. Returns a session ID and instructions prompt.',
    {},
    { readOnlyHint: true, destructiveHint: false },
    async () => {
      try {
        if (!userId) return errorResult(400, 'User authentication required');
        const session = await sessionStore.create(userId);

        // Priority: user setting > env var > default file from frontend
        const instructionsDocId = userSettings?.instructionsDocId || INSTRUCTIONS_DOC_ID;

        let instructionsText: string;
        if (instructionsDocId) {
          const doc = await getDocument(instructionsDocId, clients);
          instructionsText = doc.content;
        } else if (FRONTEND_URL) {
          const res = await fetch(`${FRONTEND_URL}/defaults/instructions.txt`);
          if (!res.ok) return errorResult(500, 'Failed to fetch default instructions');
          instructionsText = await res.text();
        } else {
          return errorResult(500, 'No instructions configured. Set instructionsDocId in settings or configure FRONTEND_URL.');
        }

        // Build settings and warnings for the AI
        const settings: Record<string, string> = {};
        const warnings: string[] = [];

        // Fetch context doc content inline if configured (optional — skipped if empty)
        let contextContent: string | undefined;
        if (userSettings?.contextDocId) {
          settings.contextDocId = userSettings.contextDocId;
          try {
            const doc = await getDocument(userSettings.contextDocId, clients);
            contextContent = doc.content;
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            warnings.push(`Failed to load context document: ${msg}. You can still ask the user for their work history.`);
          }
        }

        // Template is required for finalization but content is not returned
        if (userSettings?.templateDocId) {
          settings.templateDocId = userSettings.templateDocId;
        } else {
          warnings.push('templateDocId is not configured. The user must set a CV template document ID in Settings before a CV can be generated.');
        }

        const response: Record<string, unknown> = {
          sessionId: session.id,
          prompt: replacePlaceholders(instructionsText),
          settings,
        };
        if (contextContent) response.context = contextContent;
        if (warnings.length > 0) response.warnings = warnings;

        return textResult(JSON.stringify(response));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        if (msg.includes('403') || msg.includes('forbidden') || msg.includes('insufficient')) {
          return errorResult(403, `Access denied reading a configured document. The user may need to grant "View your Google Drive files" permission in Security settings.`);
        }
        return errorResult(500, msg);
      }
    },
  );

  server.tool(
    'update_cv_data',
    'Deep-merge data into the session store. Accepts a single object or an array of objects to merge sequentially. ' +
    'Set finalize=true with a templateDocId to generate the CV after merging.',
    {
      sessionId: z.string().uuid().describe('Session ID'),
      data: z.union([
        z.record(z.string(), z.unknown()),
        z.array(z.record(z.string(), z.unknown())),
      ]).describe('Data to deep-merge into the session (single object or array of objects)'),
      finalize: z.boolean().optional().describe('If true, generate CV after merging data'),
      templateDocId: z.string().optional().describe('Google Docs template ID (required when finalize=true)'),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ sessionId, data, finalize, templateDocId }) => {
      try {
        if (!userId) return errorResult(400, 'User authentication required');
        const items = Array.isArray(data) ? data : [data];
        let session;
        for (const item of items) {
          session = await sessionStore.update(sessionId, userId, item);
        }
        if (!session) return errorResult(404, `Session ${sessionId} not found`);

        if (finalize) {
          if (!templateDocId) return errorResult(400, 'templateDocId is required when finalize=true');
          const { documentId, url } = await invokeCvLambda(templateDocId, session.data, userToken);
          await sessionStore.delete(sessionId, userId);
          return textResult(JSON.stringify({ sessionId: session.id, data: session.data, cv: { documentId, url } }));
        }

        return textResult(JSON.stringify({ sessionId: session.id, data: session.data }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return errorResult(404, msg);
      }
    },
  );

  server.tool(
    'finalize_cv',
    'Generate the final CV document from the accumulated session data and a template.',
    {
      sessionId: z.string().uuid().describe('Session ID with accumulated CV data'),
      templateDocId: z.string().describe('Google Docs template ID'),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async ({ sessionId, templateDocId }) => {
      if (!userId) return errorResult(400, 'User authentication required');
      const session = await sessionStore.get(sessionId, userId);
      if (!session) return errorResult(404, `Session ${sessionId} not found`);
      try {
        const { documentId, url } = await invokeCvLambda(templateDocId, session.data, userToken);
        await sessionStore.delete(sessionId, userId);
        return textResult(['OK', `ID: ${documentId}`, `Link: ${url}`].join('\n'));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('finalize_cv error:', err);
        return errorResult(500, msg);
      }
    },
  );

  // --- Session Management ---

  server.tool(
    'reset_sessions',
    'Delete all active CV sessions for the current user. Use when stuck or to clean up before starting fresh.',
    {},
    { readOnlyHint: false, destructiveHint: true },
    async () => {
      if (!userId) return errorResult(400, 'User authentication required');
      try {
        const count = await sessionStore.deleteAllForUser(userId);
        return textResult(`Deleted ${count} active session${count !== 1 ? 's' : ''}.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return errorResult(500, msg);
      }
    },
  );

  // --- CV Optimizer ---

  server.tool(
    'optimize_cv',
    'Optimize a CV document to fit within a target page count by adjusting margins and fixing page breaks.',
    {
      documentId: z.string().describe('Google Docs document ID of the CV to optimize'),
      targetPages: z.number().int().min(1).optional().describe('Target page count (default: 2)'),
      minMargin: z.number().min(0.5).max(1.5).optional().describe('Minimum margin in inches (default: 0.8)'),
      maxMargin: z.number().min(0.5).max(1.5).optional().describe('Maximum margin in inches (default: 1.0)'),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ documentId, targetPages, minMargin, maxMargin }) => {
      try {
        const result = await optimizeCv(documentId, clients, { targetPages, minMargin, maxMargin });
        return textResult(JSON.stringify(result));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('optimize_cv error:', err);
        return errorResult(500, msg);
      }
    },
  );

  // --- Settings ---

  const settingsResourceUri = 'ui://settings/app.html';

  registerAppTool(
    server,
    'get_settings',
    {
      title: 'Settings',
      description: 'Open settings form to configure CV generation preferences: folderPath, contextDocId, instructionsDocId, templateDocId.',
      inputSchema: {},
      _meta: {
        ui: { resourceUri: settingsResourceUri },
      },
    },
    async () => {
      if (!userId) return errorResult(400, 'User authentication required');
      try {
        const user = await getUser(userId);
        const settings = user?.settings || {};
        return textResult(JSON.stringify(settings));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return errorResult(500, msg);
      }
    },
  );

  registerAppResource(
    server,
    settingsResourceUri,
    settingsResourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [{ uri: settingsResourceUri, mimeType: RESOURCE_MIME_TYPE, text: settingsAppHtml() }],
    }),
  );

  server.tool(
    'validate_doc',
    'Validate a Google Doc ID and return its title. Used by the settings form to check document access.',
    {
      documentId: z.string().describe('Google Docs document ID to validate'),
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ documentId }) => {
      if (!userId) return errorResult(400, 'User authentication required');
      try {
        const doc = await getDocumentTitle(documentId, clients);
        return textResult(JSON.stringify({ valid: true, title: doc.title }));
      } catch (err: unknown) {
        const code = (err as { code?: number })?.code || (err as { response?: { status?: number } })?.response?.status;
        const error = code === 404 ? 'Document not found' : code === 403 ? 'No access to document' : 'Could not validate';
        return textResult(JSON.stringify({ valid: false, error }));
      }
    },
  );

  server.tool(
    'update_settings',
    'Update user settings. Validates doc IDs against Google Docs API before saving. ' +
    'Pass only the fields you want to change. Empty string clears a field.',
    {
      folderPath: z.string().max(500).optional().describe('Google Drive folder path for generated CVs (e.g. "cv/generated")'),
      contextDocId: z.string().max(100).optional().describe('Google Doc ID for work history context'),
      instructionsDocId: z.string().max(100).optional().describe('Google Doc ID for custom AI instructions'),
      templateDocId: z.string().max(100).optional().describe('Google Doc ID for Handlebars CV template'),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (params) => {
      if (!userId) return errorResult(400, 'User authentication required');
      try {
        const validation: Record<string, { valid: boolean; title?: string; error?: string }> = {};
        const settings: UserSettings = {};

        // Validate and collect each field
        for (const field of ['contextDocId', 'instructionsDocId', 'templateDocId'] as const) {
          if (params[field] === undefined) continue;
          const value = params[field];
          if (!value) {
            settings[field] = '';
            continue;
          }
          try {
            const doc = await getDocumentTitle(value, clients);
            validation[field] = { valid: true, title: doc.title };
            settings[field] = value;
          } catch (err: unknown) {
            const code = (err as { code?: number })?.code || (err as { response?: { status?: number } })?.response?.status;
            const error = code === 404 ? 'Document not found' : code === 403 ? 'No access to document' : 'Could not validate';
            validation[field] = { valid: false, error };
            return textResult(JSON.stringify({ error: `Invalid ${field}: ${error}`, validation }));
          }
        }

        if (params.folderPath !== undefined) {
          settings.folderPath = params.folderPath;
        }

        await updateUserSettings(userId, settings);
        const user = await getUser(userId);
        return textResult(JSON.stringify({ settings: user?.settings || {}, validation }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return errorResult(500, msg);
      }
    },
  );

  return server;
}
