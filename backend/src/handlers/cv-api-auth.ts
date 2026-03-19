import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  findFolderByPath,
  updateDocumentFromHtml,
  getDocumentTitle,
  type GoogleClients,
} from '../services/google-docs.js';
import { generateCv } from '../services/cv-generation.js';
import { optimizeCv } from '../services/cv-optimizer.js';
import { verifyJwt } from '../services/auth.js';
import { getUser, updateUserSettings, getGoogleClientsForUser, incrementCvCount, getAllUsersAdmin, type UserSettings } from '../services/user-store.js';
import { getUserByAccessToken } from '../services/oauth-store.js';
import { optionsResponse } from '../shared/cors.js';
import { jsonResponse } from '../shared/response.js';
import { handleError } from '../shared/errors.js';
import {
  cvGenerateRequestSchema,
  optimizeRequestSchema,
  docUpdateRequestSchema,
  userSettingsSchema,
} from '../shared/validation.js';

interface AuthContext {
  userId: string;
  clients: GoogleClients;
}

function parseBody(event: APIGatewayProxyEventV2): unknown {
  if (!event.body) return null;
  return JSON.parse(event.body);
}

async function authenticate(event: APIGatewayProxyEventV2): Promise<AuthContext | null> {
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);

  // Try JWT first (web), then opaque token (MCP)
  try {
    const payload = await verifyJwt(token);
    const clients = await getGoogleClientsForUser(payload.sub);
    return { userId: payload.sub, clients };
  } catch {
    // Not a JWT — try as opaque access token
    const userId = await getUserByAccessToken(token);
    if (!userId) return null;
    const clients = await getGoogleClientsForUser(userId);
    return { userId, clients };
  }
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const path = event.rawPath || '/';
  const method = event.requestContext.http.method;

  if (method === 'OPTIONS') return optionsResponse();

  try {
    // User settings endpoints
    if (path === '/user/settings' && method === 'GET') {
      const auth = await authenticate(event);
      if (!auth) return jsonResponse(401, { error: 'Unauthorized' });
      return handleGetSettings(auth.userId);
    }

    if (path === '/user/settings' && method === 'PUT') {
      const auth = await authenticate(event);
      if (!auth) return jsonResponse(401, { error: 'Unauthorized' });
      return handleUpdateSettings(event, auth);
    }

    if (path === '/user/files' && method === 'GET') {
      const auth = await authenticate(event);
      if (!auth) return jsonResponse(401, { error: 'Unauthorized' });
      return handleListFiles(auth);
    }

    // CV endpoints (auth-protected)
    if ((path === '/cv/generate' || path === '/cv') && method === 'POST') {
      const auth = await authenticate(event);
      if (!auth) return jsonResponse(401, { error: 'Unauthorized' });
      return handleGenerate(event, auth);
    }

    if (path === '/cv/optimize' && method === 'POST') {
      const auth = await authenticate(event);
      if (!auth) return jsonResponse(401, { error: 'Unauthorized' });
      return handleOptimize(event, auth);
    }

    // Admin endpoints
    if (path === '/admin/users' && method === 'GET') {
      const auth = await authenticate(event);
      if (!auth) return jsonResponse(401, { error: 'Unauthorized' });
      return handleAdminUsers(auth.userId);
    }

    if (path === '/cv' && method === 'GET') {
      return jsonResponse(200, {
        service: 'Prompt CV API (authenticated)',
        endpoints: {
          'POST /cv/generate': 'Generate CV from template + data',
          'POST /cv/optimize': 'Optimize CV to fit within 2 pages',
          'GET /user/settings': 'Get user settings',
          'PUT /user/settings': 'Update user settings',
          'GET /user/files': 'List generated CV files',
        },
      });
    }

    const docsHtmlMatch = path.match(/^\/docs\/([^/]+)\/html$/);
    if (docsHtmlMatch && method === 'PUT') {
      const auth = await authenticate(event);
      if (!auth) return jsonResponse(401, { error: 'Unauthorized' });
      return handleUpdateDocHtml(event, docsHtmlMatch[1], auth.clients);
    }

    return jsonResponse(404, { error: 'Not found' });
  } catch (error) {
    const { statusCode, body } = handleError(error);
    return jsonResponse(statusCode, body);
  }
}

// --- Settings Handlers ---

async function handleGetSettings(userId: string): Promise<APIGatewayProxyResultV2> {
  const user = await getUser(userId);
  return jsonResponse(200, { settings: user?.settings || {} });
}

interface DocValidation {
  valid: boolean;
  title?: string;
  error?: string;
}

async function validateDocId(docId: string, clients: GoogleClients): Promise<DocValidation> {
  try {
    const doc = await getDocumentTitle(docId, clients);
    return { valid: true, title: doc.title };
  } catch (err: any) {
    const status = err?.code || err?.response?.status;
    if (status === 404) return { valid: false, error: 'Document not found. Check the ID.' };
    if (status === 403) return { valid: false, error: 'No access. Share the document with your Google account or make it public.' };
    return { valid: false, error: 'Could not validate document.' };
  }
}

async function handleUpdateSettings(event: APIGatewayProxyEventV2, auth: AuthContext): Promise<APIGatewayProxyResultV2> {
  let body: unknown;
  try { body = parseBody(event); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }
  if (!body) return jsonResponse(400, { error: 'Request body required' });

  const parsed = userSettingsSchema.safeParse(body);
  if (!parsed.success) return jsonResponse(400, { error: 'Invalid request', details: parsed.error.issues });

  const settings = parsed.data as UserSettings;

  // Validate non-empty doc IDs before saving
  const docFields = ['contextDocId', 'instructionsDocId', 'templateDocId'] as const;
  const validation: Record<string, DocValidation> = {};
  await Promise.all(
    docFields
      .filter(field => settings[field]?.trim())
      .map(async (field) => {
        validation[field] = await validateDocId(settings[field]!, auth.clients);
      }),
  );

  const hasErrors = Object.values(validation).some(v => !v.valid);
  if (hasErrors) {
    return jsonResponse(400, { error: 'Invalid document IDs', validation });
  }

  // All valid — save
  await updateUserSettings(auth.userId, settings);
  return jsonResponse(200, { settings, validation });
}

async function handleListFiles(auth: AuthContext): Promise<APIGatewayProxyResultV2> {
  const user = await getUser(auth.userId);
  const folderPath = user?.settings?.folderPath || 'cv/generated';
  const folderId = await findFolderByPath(folderPath, auth.clients);
  if (!folderId) return jsonResponse(200, { files: [] });

  const { drive } = auth.clients;
  const response = await drive.files.list({
    q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.document' and trashed = false`,
    fields: 'files(id, name, createdTime, modifiedTime, webViewLink)',
    orderBy: 'modifiedTime desc',
    pageSize: 50,
  });
  return jsonResponse(200, { files: response.data.files || [] });
}

// --- Admin Handlers ---

async function handleAdminUsers(userId: string): Promise<APIGatewayProxyResultV2> {
  const user = await getUser(userId);
  if (!user?.isAdmin) return jsonResponse(403, { error: 'Admin access required' });
  const users = await getAllUsersAdmin();
  return jsonResponse(200, { users });
}

// --- CV Handlers ---

async function handleOptimize(event: APIGatewayProxyEventV2, auth: AuthContext): Promise<APIGatewayProxyResultV2> {
  let body: unknown;
  try { body = parseBody(event); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }
  if (!body) return jsonResponse(400, { error: 'Request body required' });

  const parsed = optimizeRequestSchema.safeParse(body);
  if (!parsed.success) return jsonResponse(400, { error: 'Invalid request', details: parsed.error.issues });

  const result = await optimizeCv(parsed.data.documentId, auth.clients, {
    targetPages: parsed.data.targetPages,
    minMargin: parsed.data.minMargin,
    maxMargin: parsed.data.maxMargin,
  });
  return jsonResponse(200, result);
}

async function handleUpdateDocHtml(
  event: APIGatewayProxyEventV2,
  documentId: string,
  clients: GoogleClients,
): Promise<APIGatewayProxyResultV2> {
  let body: unknown;
  try { body = parseBody(event); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }
  if (!body) return jsonResponse(400, { error: 'Request body required' });

  const parsed = docUpdateRequestSchema.safeParse(body);
  if (!parsed.success) return jsonResponse(400, { error: 'Invalid request', details: parsed.error.issues });

  await updateDocumentFromHtml(documentId, parsed.data.content, clients);
  return jsonResponse(200, { success: true, documentId });
}

async function handleGenerate(event: APIGatewayProxyEventV2, auth: AuthContext): Promise<APIGatewayProxyResultV2> {
  let body: unknown;
  try { body = parseBody(event); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }
  if (!body) return jsonResponse(400, { error: 'Request body required' });

  const parsed = cvGenerateRequestSchema.safeParse(body);
  if (!parsed.success) return jsonResponse(400, { error: 'Invalid request', details: parsed.error.issues });

  const user = await getUser(auth.userId);
  const folderPath = user?.settings?.folderPath || 'cv/generated';

  const result = await generateCv({
    templateDocId: parsed.data.templateDocId,
    data: parsed.data.data,
    folderPath,
    clients: auth.clients,
  });

  await incrementCvCount(auth.userId);

  return jsonResponse(200, result);
}
