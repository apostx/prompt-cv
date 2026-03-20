import express from 'express';
import type { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { createServer } from './server.js';
import { getUserByAccessToken } from '../services/oauth-store.js';
import { getGoogleClientsForUser, getUser } from '../services/user-store.js';

const PORT = parseInt(process.env.PORT || '8080', 10);

const app = express();
app.use(express.json());

// Request logging
app.use((req: Request, _res: Response, next) => {
  console.log(`${req.method} ${req.path}`);
  if (req.method === 'POST' && req.body) {
    const method = req.body.method || req.body[0]?.method || 'unknown';
    console.log(`  -> ${method}`);
  }
  next();
});

// CORS middleware
app.use((_req: Request, res: Response, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, Authorization, Accept, Mcp-Session-Id, Mcp-Protocol-Version');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  if (_req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Extract Bearer token from Authorization header
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

// OAuth metadata discovery (for MCP clients)
app.get('/.well-known/oauth-authorization-server', (_req: Request, res: Response) => {
  const apiUrl = process.env.AUTH_API_URL || '';
  res.json({
    issuer: apiUrl,
    authorization_endpoint: `${apiUrl}/oauth/authorize`,
    token_endpoint: `${apiUrl}/oauth/token`,
    registration_endpoint: `${apiUrl}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
  });
});

// POST /mcp — stateless: every request authenticates independently
app.post('/mcp', async (req: Request, res: Response) => {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Unauthorized: Bearer token required' },
      id: req.body?.id ?? null,
    });
    return;
  }

  let userId: string | null;
  try {
    userId = await getUserByAccessToken(token);
  } catch (err) {
    console.error('[auth] Token lookup failed:', err);
    res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Unauthorized: invalid token' },
      id: req.body?.id ?? null,
    });
    return;
  }

  if (!userId) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Unauthorized: invalid or expired token' },
      id: req.body?.id ?? null,
    });
    return;
  }

  let clients;
  try {
    clients = await getGoogleClientsForUser(userId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    const isTokenError = msg.includes('unauthorized_client') || msg.includes('invalid_grant');
    console.error('[auth] Failed to get Google clients for user:', isTokenError ? msg : err);
    res.status(isTokenError ? 401 : 500).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: isTokenError
          ? 'Google credentials expired or revoked. Please log out and log back in at the web app to re-authorize.'
          : 'Failed to initialize Google API clients',
      },
      id: req.body?.id ?? null,
    });
    return;
  }

  const user = await getUser(userId);
  const userSettings = user?.settings || {};

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const mcpServer = createServer({ clients, userToken: token, userSettings, userId });
  await mcpServer.connect(transport);

  try {
    await transport.handleRequest(req, res, req.body);
  } finally {
    await mcpServer.close().catch(() => {});
    await transport.close().catch(() => {});
  }
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`MCP server listening on http://0.0.0.0:${PORT}`);
});

// Graceful shutdown
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`Received ${signal}, shutting down...`);
    server.close(() => process.exit(0));
  });
}
