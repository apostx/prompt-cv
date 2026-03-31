import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  resolveFolderId,
  updateDocumentFromHtml,
  getDocumentTitle,
  createDocument,
  moveFileToFolder,
  findFolder,
  findFileByName,
  findOrCreateFolder,
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
  createDefaultDocSchema,
  setupInitSchema,
} from '../shared/validation.js';
import { historyStore } from '../mcp/history-store.js';
import { configStore } from '../services/config-store.js';

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

    if (path === '/user/picker-config' && method === 'GET') {
      const auth = await authenticate(event);
      if (!auth) return jsonResponse(401, { error: 'Unauthorized' });
      return handleGetPickerConfig(auth.userId);
    }

    if (path === '/user/docs/create' && method === 'POST') {
      const auth = await authenticate(event);
      if (!auth) return jsonResponse(401, { error: 'Unauthorized' });
      return handleCreateDefaultDoc(event, auth);
    }

    if (path === '/user/validate-doc' && method === 'GET') {
      const auth = await authenticate(event);
      if (!auth) return jsonResponse(401, { error: 'Unauthorized' });
      const docId = event.queryStringParameters?.id;
      if (!docId) return jsonResponse(400, { error: 'Missing id parameter' });
      const result = await validateDocId(docId, auth.clients);
      return jsonResponse(200, result);
    }

    if (path === '/user/resolve-folder' && method === 'GET') {
      const auth = await authenticate(event);
      if (!auth) return jsonResponse(401, { error: 'Unauthorized' });
      const folderId = event.queryStringParameters?.id;
      if (!folderId) return jsonResponse(400, { error: 'Missing id parameter' });
      const folderPath = await resolveFolderPath(folderId, auth.clients);
      return jsonResponse(200, { path: folderPath });
    }

    if (path === '/user/setup-check' && method === 'GET') {
      const auth = await authenticate(event);
      if (!auth) return jsonResponse(401, { error: 'Unauthorized' });
      return handleSetupCheck(auth);
    }

    if (path === '/user/setup-init' && method === 'POST') {
      const auth = await authenticate(event);
      if (!auth) return jsonResponse(401, { error: 'Unauthorized' });
      return handleSetupInit(event, auth);
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

    // History endpoints
    if (path === '/user/history' && method === 'GET') {
      const auth = await authenticate(event);
      if (!auth) return jsonResponse(401, { error: 'Unauthorized' });
      return handleGetHistory(auth.userId);
    }

    const historyStatusMatch = path.match(/^\/user\/history\/([^/]+)\/status$/);
    if (historyStatusMatch && method === 'PUT') {
      const auth = await authenticate(event);
      if (!auth) return jsonResponse(401, { error: 'Unauthorized' });
      return handleUpdateHistoryStatus(event, auth.userId, decodeURIComponent(historyStatusMatch[1]));
    }

    // Admin endpoints
    if (path === '/admin/users' && method === 'GET') {
      const auth = await authenticate(event);
      if (!auth) return jsonResponse(401, { error: 'Unauthorized' });
      return handleAdminUsers(auth.userId);
    }

    if (path === '/admin/history' && method === 'GET') {
      const auth = await authenticate(event);
      if (!auth) return jsonResponse(401, { error: 'Unauthorized' });
      return handleAdminHistory(auth.userId);
    }

    if (path === '/admin/config' && method === 'GET') {
      const auth = await authenticate(event);
      if (!auth) return jsonResponse(401, { error: 'Unauthorized' });
      return handleAdminConfigGet(auth.userId);
    }

    const configKeyMatch = path.match(/^\/admin\/config\/([^/]+)$/);
    if (configKeyMatch && method === 'PUT') {
      const auth = await authenticate(event);
      if (!auth) return jsonResponse(401, { error: 'Unauthorized' });
      return handleAdminConfigPut(event, auth.userId, decodeURIComponent(configKeyMatch[1]));
    }
    if (configKeyMatch && method === 'DELETE') {
      const auth = await authenticate(event);
      if (!auth) return jsonResponse(401, { error: 'Unauthorized' });
      return handleAdminConfigDelete(auth.userId, decodeURIComponent(configKeyMatch[1]));
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
  path?: string;
  error?: string;
}

async function resolveFolderPath(folderId: string, clients: GoogleClients): Promise<string | undefined> {
  try {
    const { drive } = clients;
    const parts: string[] = [];
    let currentId: string | undefined = folderId;
    while (currentId && parts.length < 6) {
      try {
        const res = await drive.files.get({ fileId: currentId, fields: 'name,parents' });
        const name = res.data.name as string | undefined;
        const nextParents = res.data.parents as string[] | undefined;
        if (!name) break;
        parts.unshift(name);
        currentId = nextParents?.[0];
      } catch { break; }
    }
    if (!parts.length) return undefined;
    // Strip root "My Drive" prefix — paths should be relative
    if (parts[0] === 'My Drive') parts.shift();
    return parts.length ? parts.join('/') : undefined;
  } catch { return undefined; }
}

async function resolveDocPath(docId: string, clients: GoogleClients): Promise<string | undefined> {
  try {
    const { drive } = clients;
    const file = await drive.files.get({ fileId: docId, fields: 'parents' });
    const parents = file.data.parents;
    if (!parents?.length) return undefined;

    const parts: string[] = [];
    let currentId: string | undefined = parents[0];
    while (currentId && parts.length < 5) {
      try {
        const res = await drive.files.get({ fileId: currentId, fields: 'name,parents' });
        const name = res.data.name as string | undefined;
        const nextParents = res.data.parents as string[] | undefined;
        if (!name) break;
        parts.unshift(name);
        currentId = nextParents?.[0];
      } catch { break; }
    }
    return parts.length ? parts.join('/') : undefined;
  } catch { return undefined; }
}

async function validateDocId(docId: string, clients: GoogleClients): Promise<DocValidation> {
  try {
    const [doc, path] = await Promise.all([
      getDocumentTitle(docId, clients),
      resolveDocPath(docId, clients),
    ]);
    return { valid: true, title: doc.title, path };
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

  // Validate all doc IDs before saving
  const docFields = ['contextDocId', 'instructionsDocId', 'templateDocId'] as const;
  const validation: Record<string, DocValidation> = {};
  await Promise.all(
    docFields.map(async (field) => {
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
  const folderId = await resolveFolderId(folderPath, auth.clients);
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

// --- Picker / Doc Creation Handlers ---

async function handleGetPickerConfig(userId: string): Promise<APIGatewayProxyResultV2> {
  const user = await getUser(userId);
  if (!user) return jsonResponse(404, { error: 'User not found' });

  const appId = (process.env.GOOGLE_CLIENT_ID || '').split('-')[0];

  // Refresh token if expired before returning
  if (Date.now() >= user.googleTokenExpiry) {
    await getGoogleClientsForUser(userId);
    const refreshedUser = await getUser(userId);
    return jsonResponse(200, {
      accessToken: refreshedUser?.googleAccessToken || user.googleAccessToken,
      apiKey: process.env.GOOGLE_API_KEY || '',
      appId,
    });
  }

  return jsonResponse(200, {
    accessToken: user.googleAccessToken,
    apiKey: process.env.GOOGLE_API_KEY || '',
    appId,
  });
}

async function handleCreateDefaultDoc(event: APIGatewayProxyEventV2, auth: AuthContext): Promise<APIGatewayProxyResultV2> {
  let body: unknown;
  try { body = parseBody(event); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }
  if (!body) return jsonResponse(400, { error: 'Request body required' });

  const parsed = createDefaultDocSchema.safeParse(body);
  if (!parsed.success) return jsonResponse(400, { error: 'Invalid request', details: parsed.error.issues });

  const { type, folderId, title: customTitle } = parsed.data;

  let content: string | undefined;
  let defaultTitle: string;

  if (type === 'context') {
    defaultTitle = 'My CV Context';
  } else {
    const frontendUrl = process.env.FRONTEND_URL || '';
    const filename = type === 'instructions' ? 'instructions.txt' : 'schema.txt';
    defaultTitle = type === 'instructions' ? 'My CV Instructions' : 'My CV Template';

    const res = await fetch(`${frontendUrl}/defaults/${filename}`);
    if (!res.ok) return jsonResponse(500, { error: `Failed to fetch default ${type}` });
    content = await res.text();
  }

  const title = customTitle || defaultTitle;

  const doc = await createDocument(title, content, auth.clients);

  // Move to chosen folder if specified
  if (folderId) {
    await moveFileToFolder(doc.documentId, folderId, auth.clients);
  }

  return jsonResponse(200, {
    documentId: doc.documentId,
    title: doc.title,
    url: `https://docs.google.com/document/d/${doc.documentId}`,
  });
}

// --- Setup Handlers ---

async function handleSetupCheck(auth: AuthContext): Promise<APIGatewayProxyResultV2> {
  try {
    const folderId = await findFolder('.prompt-cv', undefined, auth.clients);
    if (!folderId) {
      return jsonResponse(200, { files: {} });
    }

    const [contextDocId, instructionsDocId, templateDocId, generatedFolderId] = await Promise.all([
      findFileByName('cv-context', folderId, auth.clients),
      findFileByName('cv-instructions', folderId, auth.clients),
      findFileByName('cv-template', folderId, auth.clients),
      findFolder('generated', folderId, auth.clients),
    ]);

    return jsonResponse(200, {
      folderId,
      files: {
        ...(contextDocId && { contextDocId }),
        ...(instructionsDocId && { instructionsDocId }),
        ...(templateDocId && { templateDocId }),
        ...(generatedFolderId && { generatedFolderId }),
      },
    });
  } catch (err) {
    console.error('setup-check error:', err);
    return jsonResponse(500, { error: err instanceof Error ? err.message : 'Internal error' });
  }
}

async function handleSetupInit(event: APIGatewayProxyEventV2, auth: AuthContext): Promise<APIGatewayProxyResultV2> {
  let body: unknown;
  try { body = parseBody(event); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }
  if (!body) return jsonResponse(400, { error: 'Request body required' });

  const parsed = setupInitSchema.safeParse(body);
  if (!parsed.success) return jsonResponse(400, { error: 'Invalid request', details: parsed.error.issues });

  const { folder, context, instructions, template } = parsed.data;
  const frontendUrl = process.env.FRONTEND_URL || '';

  try {
    // Resolve or create folder
    let folderPath: string;
    let promptCvFolderId: string;
    if (folder === 'default') {
      promptCvFolderId = await findOrCreateFolder('.prompt-cv', undefined, auth.clients);
      await findOrCreateFolder('generated', promptCvFolderId, auth.clients);
      folderPath = '.prompt-cv/generated';
    } else {
      folderPath = folder.id;
      promptCvFolderId = ''; // manual folder — docs won't be auto-placed
    }

    // Create or use each doc
    let contextDocId: string;
    if (context === 'default') {
      const doc = await createDocument('cv-context', undefined, auth.clients);
      if (promptCvFolderId) await moveFileToFolder(doc.documentId, promptCvFolderId, auth.clients);
      contextDocId = doc.documentId;
    } else {
      contextDocId = context.id;
    }

    let instructionsDocId: string;
    if (instructions === 'default') {
      let content: string | undefined;
      content = await configStore.get('default-instructions');
      if (!content && frontendUrl) {
        const res = await fetch(`${frontendUrl}/defaults/instructions.txt`);
        if (res.ok) content = await res.text();
      }
      const doc = await createDocument('cv-instructions', content, auth.clients);
      if (promptCvFolderId) await moveFileToFolder(doc.documentId, promptCvFolderId, auth.clients);
      instructionsDocId = doc.documentId;
    } else {
      instructionsDocId = instructions.id;
    }

    let templateDocId: string;
    if (template === 'default') {
      let content: string | undefined;
      content = await configStore.get('default-template');
      if (!content && frontendUrl) {
        const res = await fetch(`${frontendUrl}/defaults/schema.txt`);
        if (res.ok) content = await res.text();
      }
      const doc = await createDocument('cv-template', content, auth.clients);
      if (promptCvFolderId) await moveFileToFolder(doc.documentId, promptCvFolderId, auth.clients);
      templateDocId = doc.documentId;
    } else {
      templateDocId = template.id;
    }

    // Save settings
    await updateUserSettings(auth.userId, {
      folderPath,
      contextDocId,
      instructionsDocId,
      templateDocId,
      initialized: true,
    });

    const user = await getUser(auth.userId);
    return jsonResponse(200, { settings: user?.settings || {} });
  } catch (err) {
    console.error('setup-init error:', err);
    return jsonResponse(500, { error: err instanceof Error ? err.message : 'Internal error' });
  }
}

// --- History Handlers ---

async function handleGetHistory(userId: string): Promise<APIGatewayProxyResultV2> {
  const records = await historyStore.getForUser(userId);
  // Parse JSON strings back to objects for the frontend
  const history = records.map(r => ({
    ...r,
    cvData: r.cvData ? JSON.parse(r.cvData) : undefined,
    stats: r.stats ? JSON.parse(r.stats) : undefined,
  }));
  return jsonResponse(200, { history });
}

async function handleUpdateHistoryStatus(
  event: APIGatewayProxyEventV2,
  userId: string,
  documentId: string,
): Promise<APIGatewayProxyResultV2> {
  let body: unknown;
  try { body = parseBody(event); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }
  if (!body || typeof body !== 'object' || !('status' in body)) {
    return jsonResponse(400, { error: 'Request body must include status' });
  }
  const status = (body as { status: string }).status;
  const validStatuses = ['created', 'applied', 'refused', 'passed'];
  if (!validStatuses.includes(status)) {
    return jsonResponse(400, { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }
  try {
    await historyStore.updateStatus(userId, documentId, status);
    return jsonResponse(200, { success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse(500, { error: msg });
  }
}

// --- Admin Handlers ---

async function handleAdminUsers(userId: string): Promise<APIGatewayProxyResultV2> {
  const user = await getUser(userId);
  if (!user?.isAdmin) return jsonResponse(403, { error: 'Admin access required' });
  const users = await getAllUsersAdmin();
  return jsonResponse(200, { users });
}

async function handleAdminHistory(userId: string): Promise<APIGatewayProxyResultV2> {
  const user = await getUser(userId);
  if (!user?.isAdmin) return jsonResponse(403, { error: 'Admin access required' });
  const records = await historyStore.getAll();
  const history = records.map(r => ({
    ...r,
    cvData: r.cvData ? JSON.parse(r.cvData) : undefined,
    stats: r.stats ? JSON.parse(r.stats) : undefined,
  }));
  return jsonResponse(200, { history });
}

const ALLOWED_CONFIG_KEYS = [
  'default-instructions', 'default-template',
  'login-prompt-step3', 'login-prompt-step4', 'login-prompt-step5a', 'login-prompt-step5b',
] as const;

async function handleAdminConfigGet(userId: string): Promise<APIGatewayProxyResultV2> {
  const user = await getUser(userId);
  if (!user?.isAdmin) return jsonResponse(403, { error: 'Admin access required' });
  const config = await configStore.getAll();
  return jsonResponse(200, { config });
}

async function handleAdminConfigPut(
  event: APIGatewayProxyEventV2, userId: string, key: string,
): Promise<APIGatewayProxyResultV2> {
  const user = await getUser(userId);
  if (!user?.isAdmin) return jsonResponse(403, { error: 'Admin access required' });
  if (!ALLOWED_CONFIG_KEYS.includes(key as (typeof ALLOWED_CONFIG_KEYS)[number])) {
    return jsonResponse(400, { error: `Invalid config key. Allowed: ${ALLOWED_CONFIG_KEYS.join(', ')}` });
  }
  let body: unknown;
  try { body = parseBody(event); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }
  if (!body || typeof body !== 'object' || !('value' in body) || typeof (body as { value: unknown }).value !== 'string') {
    return jsonResponse(400, { error: 'Request body must include a string "value"' });
  }
  const value = (body as { value: string }).value;
  if (value.length > 500_000) return jsonResponse(400, { error: 'Value too large (max 500KB)' });
  await configStore.set(key, value, userId);
  return jsonResponse(200, { success: true });
}

async function handleAdminConfigDelete(userId: string, key: string): Promise<APIGatewayProxyResultV2> {
  const user = await getUser(userId);
  if (!user?.isAdmin) return jsonResponse(403, { error: 'Admin access required' });
  if (!ALLOWED_CONFIG_KEYS.includes(key as (typeof ALLOWED_CONFIG_KEYS)[number])) {
    return jsonResponse(400, { error: `Invalid config key. Allowed: ${ALLOWED_CONFIG_KEYS.join(', ')}` });
  }
  await configStore.remove(key);
  return jsonResponse(200, { success: true });
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
