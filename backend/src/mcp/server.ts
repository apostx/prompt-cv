import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EXTENSION_ID } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';

import { getDocument, updateDocument, appendToDocument, type GoogleClients } from '../services/google-docs.js';
import { getUser, type UserSettings } from '../services/user-store.js';
import { historyStore, type HistoryRecord } from './history-store.js';
import { configStore } from '../services/config-store.js';

const CV_FUNCTION_NAME = process.env.CV_FUNCTION_NAME || '';
import { optimizeCv } from '../services/cv-optimizer.js';
import { sessionStore, type CvSession } from './session-store.js';

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
    { name: 'prompt-cv', version: '2.6.0' },
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

  server.tool(
    'update_doc_content',
    'Update the plain text content of a Google Doc. Use to update context or instructions documents after CV generation.',
    {
      documentId: z.string().describe('Google Docs document ID'),
      content: z.string().max(500_000).describe('Plain text content to write'),
      mode: z.enum(['replace', 'append']).default('replace').describe('Write mode: replace all content or append to end'),
    },
    { readOnlyHint: false, destructiveHint: true },
    async ({ documentId, content, mode }) => {
      try {
        if (mode === 'append') {
          await appendToDocument(documentId, content, clients);
        } else {
          await updateDocument(documentId, content, clients);
        }
        return textResult(`Document ${documentId} updated (${mode}).`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        if (msg.includes('403') || msg.includes('forbidden')) {
          return errorResult(403, `Access denied for document ${documentId}. The user may need to share the document.`);
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
        } else {
          const configInstructions = await configStore.get('default-instructions');
          if (configInstructions) {
            instructionsText = configInstructions;
          } else if (FRONTEND_URL) {
            const res = await fetch(`${FRONTEND_URL}/defaults/instructions.txt`);
            if (!res.ok) return errorResult(500, 'Failed to fetch default instructions');
            instructionsText = await res.text();
          } else {
            return errorResult(500, 'No instructions configured. Set instructionsDocId in settings or configure FRONTEND_URL.');
          }
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
    'Set finalize=true with a templateDocId to generate the CV after merging. ' +
    'Optionally include stats for job analysis tracking (triggers history storage on finalization).',
    {
      sessionId: z.string().uuid().describe('Session ID'),
      data: z.union([
        z.record(z.string(), z.unknown()),
        z.array(z.record(z.string(), z.unknown())),
      ]).describe('Data to deep-merge into the session (single object or array of objects)'),
      finalize: z.boolean().optional().describe('If true, generate CV after merging data'),
      templateDocId: z.string().optional().describe('Google Docs template ID (required when finalize=true)'),
      stats: z.object({
        jobTitle: z.string().max(200).optional(),
        jobDescription: z.string().max(5000).optional(),
        jobLink: z.string().url().max(500).optional(),
        jobAnalysis: z.string().max(5000).optional(),
        matchEvaluation: z.string().max(5000).optional(),
        rating: z.number().min(0).max(10).optional(),
      }).optional().describe('Job analysis stats — if provided, CV history will be stored on finalization'),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ sessionId, data, finalize, templateDocId, stats }) => {
      try {
        if (!userId) return errorResult(400, 'User authentication required');
        const items = Array.isArray(data) ? data : [data];
        let session;
        for (const item of items) {
          session = await sessionStore.update(sessionId, userId, item);
        }
        if (!session) return errorResult(404, `Session ${sessionId} not found`);

        if (stats) {
          session = await sessionStore.updateStats(sessionId, userId, stats);
        }

        if (finalize) {
          if (!templateDocId) return errorResult(400, 'templateDocId is required when finalize=true');
          const { documentId, url } = await invokeCvLambda(templateDocId, session.data, userToken);
          await maybeSaveHistory(session, documentId, url, templateDocId, clients, userSettings);
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
        await maybeSaveHistory(session, documentId, url, templateDocId, clients, userSettings);
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

  // --- Context & Instructions ---

  server.tool(
    'read_cv_context',
    'Read the current content of the user\'s CV context document (work history, experience, skills). Returns the full plain text.',
    {},
    { readOnlyHint: true, destructiveHint: false },
    async () => {
      if (!userId) return errorResult(400, 'User authentication required');
      const docId = userSettings?.contextDocId;
      if (!docId) return errorResult(400, 'No context document configured. Set contextDocId in Settings first.');
      try {
        const doc = await getDocument(docId, clients);
        return textResult(doc.content);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return errorResult(500, msg);
      }
    },
  );

  server.tool(
    'update_cv_context',
    'Update the user\'s CV context document with new content. Always read_cv_context first to understand the current state, then update with the full revised content.',
    {
      content: z.string().max(500_000).describe('Full plain text content to replace the document with'),
    },
    { readOnlyHint: false, destructiveHint: true },
    async ({ content }) => {
      if (!userId) return errorResult(400, 'User authentication required');
      const docId = userSettings?.contextDocId;
      if (!docId) return errorResult(400, 'No context document configured. Set contextDocId in Settings first.');
      try {
        await updateDocument(docId, content, clients);
        return textResult(`Context document updated.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return errorResult(500, msg);
      }
    },
  );

  server.tool(
    'read_cv_instructions',
    'Read the current content of the user\'s custom CV generation instructions document.',
    {},
    { readOnlyHint: true, destructiveHint: false },
    async () => {
      if (!userId) return errorResult(400, 'User authentication required');
      const docId = userSettings?.instructionsDocId;
      if (!docId) return errorResult(400, 'No instructions document configured. Set instructionsDocId in Settings first.');
      try {
        const doc = await getDocument(docId, clients);
        return textResult(doc.content);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return errorResult(500, msg);
      }
    },
  );

  server.tool(
    'update_cv_instructions',
    'Update the user\'s custom CV generation instructions document. Always read_cv_instructions first to understand the current state, then update with the full revised content.',
    {
      content: z.string().max(500_000).describe('Full plain text content to replace the document with'),
    },
    { readOnlyHint: false, destructiveHint: true },
    async ({ content }) => {
      if (!userId) return errorResult(400, 'User authentication required');
      const docId = userSettings?.instructionsDocId;
      if (!docId) return errorResult(400, 'No instructions document configured. Set instructionsDocId in Settings first.');
      try {
        await updateDocument(docId, content, clients);
        return textResult(`Instructions document updated.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return errorResult(500, msg);
      }
    },
  );

  async function maybeSaveHistory(
    session: CvSession,
    documentId: string,
    documentUrl: string,
    templateDocId: string,
    googleClients?: GoogleClients,
    settings?: UserSettings,
  ): Promise<void> {
    if (!session.stats || !userId) return;
    try {
      const user = await getUser(userId);
      const email = user?.email || '';

      // Fetch source docs for full process reconstruction (each independently)
      let templateContent: string | undefined;
      let contextContent: string | undefined;
      let instructionsContent: string | undefined;

      try { templateContent = (await getDocument(templateDocId, googleClients)).content; } catch { /* skip */ }
      if (settings?.contextDocId) {
        try { contextContent = (await getDocument(settings.contextDocId, googleClients)).content; } catch { /* skip */ }
      }
      if (settings?.instructionsDocId) {
        try { instructionsContent = (await getDocument(settings.instructionsDocId, googleClients)).content; } catch { /* skip */ }
      }

      const record: HistoryRecord = {
        userId,
        createdAt: Date.now(),
        email,
        documentId,
        documentUrl,
        status: 'created',
        cvData: JSON.stringify(session.data),
        stats: JSON.stringify(session.stats),
        templateDocId,
        templateContent,
        contextContent,
        instructionsContent,
      };
      await historyStore.save(record);
    } catch (err) {
      console.error('[maybeSaveHistory] Failed to save history (non-fatal):', err);
    }
  }

  return server;
}
