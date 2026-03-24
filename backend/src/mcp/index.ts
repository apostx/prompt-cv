import express from 'express';
import type { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { createServer } from './server.js';
import { authenticateMcpRequest } from './auth.js';
import { settingsPage } from './settings-page.js';

const PORT = parseInt(process.env.PORT || '8080', 10);

const app = express();
app.use(express.json());

// Request logging
app.use((req: Request, res: Response, next) => {
  const startTime = Date.now();
  const mcpMethod = req.method === 'POST' && req.body
    ? (req.body.method || req.body[0]?.method || undefined)
    : undefined;
  console.log(JSON.stringify({
    event: 'request', method: req.method, path: req.path, mcpMethod, timestamp: new Date().toISOString(),
  }));
  res.on('finish', () => {
    console.log(JSON.stringify({
      event: 'response', method: req.method, path: req.path, statusCode: res.statusCode,
      durationMs: Date.now() - startTime,
    }));
  });
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

// Settings UI — served as self-contained HTML page
app.get('/settings', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(settingsPage(process.env.AUTH_API_URL || ''));
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

  const auth = await authenticateMcpRequest(token);
  if (!auth.success) {
    res.status(auth.status).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: auth.message },
      id: req.body?.id ?? null,
    });
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const mcpServer = createServer(auth.options);
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
