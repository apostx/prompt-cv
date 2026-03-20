import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { getDocument, type GoogleClients } from '../services/google-docs.js';
import type { UserSettings } from '../services/user-store.js';

const CV_FUNCTION_NAME = process.env.CV_FUNCTION_NAME || '';
import { optimizeCv } from '../services/cv-optimizer.js';
import { sessionStore } from './session-store.js';

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
}

export function createServer(options: McpServerOptions = {}): McpServer {
  const { clients, userToken, userSettings } = options;

  const server = new McpServer({
    name: 'prompt-cv',
    version: '2.1.0',
  });

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
        const session = await sessionStore.create();

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
        const items = Array.isArray(data) ? data : [data];
        let session;
        for (const item of items) {
          session = await sessionStore.update(sessionId, item);
        }
        if (!session) return errorResult(404, `Session ${sessionId} not found`);

        if (finalize) {
          if (!templateDocId) return errorResult(400, 'templateDocId is required when finalize=true');
          const { documentId, url } = await invokeCvLambda(templateDocId, session.data, userToken);
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
      const session = await sessionStore.get(sessionId);
      if (!session) return errorResult(404, `Session ${sessionId} not found`);
      try {
        const { documentId, url } = await invokeCvLambda(templateDocId, session.data, userToken);
        return textResult(['OK', `ID: ${documentId}`, `Link: ${url}`].join('\n'));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('finalize_cv error:', err);
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

  return server;
}
