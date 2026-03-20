import { randomUUID } from 'node:crypto';
import express from 'express';
import type { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createServer } from './server.js';
import { getUserByAccessToken } from '../services/oauth-store.js';
import { getGoogleClientsForUser, getUser } from '../services/user-store.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const KEEPALIVE_INTERVAL_MS = 10_000; // 10 seconds — ChatGPT appears to have a 30s idle timeout on SSE

// Session store
interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  lastActivity: number;
}

const sessions = new Map<string, Session>();

// Clean up stale sessions every 5 minutes
setInterval(async () => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
      console.log(`[session] Cleaning up stale session ${id} (idle ${Math.round((now - session.lastActivity) / 1000)}s)`);
      await session.transport.close().catch(() => {});
      await session.server.close().catch(() => {});
      sessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

const app = express();
app.use(express.json());

// Request logging
app.use((req: Request, _res: Response, next) => {
  const sessionId = req.headers['mcp-session-id'] || 'none';
  console.log(`${req.method} ${req.path} session=${sessionId}`);
  if (req.method === 'POST' && req.body) {
    const method = req.body.method || req.body[0]?.method || 'unknown';
    console.log(`  -> ${method}`);
  }
  next();
});

// CORS middleware
app.use((_req: Request, res: Response, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, Authorization, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  if (_req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', sessions: sessions.size });
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

// POST /mcp — initialize or tool calls
app.post('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  // Existing session
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    session.lastActivity = Date.now();
    await session.transport.handleRequest(req, res, req.body);
    return;
  }

  // New session (initialize request)
  if (isInitializeRequest(req.body)) {
    // Authenticate user
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Unauthorized: Bearer token required' }, id: null });
      return;
    }

    let userId: string | null;
    try {
      userId = await getUserByAccessToken(token);
    } catch (err) {
      console.error('[auth] Token lookup failed:', err);
      res.status(401).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Unauthorized: invalid token' }, id: null });
      return;
    }

    if (!userId) {
      res.status(401).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Unauthorized: invalid or expired token' }, id: null });
      return;
    }

    let clients;
    try {
      clients = await getGoogleClientsForUser(userId);
    } catch (err) {
      console.error('[auth] Failed to get Google clients for user:', err);
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Failed to initialize Google API clients' }, id: null });
      return;
    }

    const user = await getUser(userId);
    const userSettings = user?.settings || {};

    console.log(`[auth] Authenticated user ${userId}`);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (sid: string) => {
        console.log(`[session] New session initialized: ${sid} (user=${userId})`);
        sessions.set(sid, { transport, server, lastActivity: Date.now() });
      },
    });

    transport.onclose = () => {
      console.log(`[transport] Closed for session ${transport.sessionId}`);
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
      }
    };

    transport.onerror = (err: Error) => {
      console.error(`[transport] Error for session ${transport.sessionId}:`, err.message);
    };

    const server = createServer({ clients, userToken: token, userSettings });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    return;
  }

  // Stateless fallback: expired/unknown session with Bearer token — handle without session
  const token = extractBearerToken(req);
  if (token) {
    console.log(`[stateless] Handling ${req.body?.method || 'unknown'} for expired session ${sessionId || 'none'}`);

    let userId: string | null;
    try {
      userId = await getUserByAccessToken(token);
    } catch {
      res.status(401).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Unauthorized: invalid token' }, id: req.body?.id ?? null });
      return;
    }
    if (!userId) {
      res.status(401).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Unauthorized: invalid or expired token' }, id: req.body?.id ?? null });
      return;
    }

    let clients;
    try {
      clients = await getGoogleClientsForUser(userId);
    } catch {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Failed to initialize Google API clients' }, id: req.body?.id ?? null });
      return;
    }

    const user = await getUser(userId);
    const userSettings = user?.settings || {};

    const tempTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    const tempServer = createServer({ clients, userToken: token, userSettings });
    await tempServer.connect(tempTransport);

    try {
      await tempTransport.handleRequest(req, res, req.body);
    } finally {
      await tempServer.close().catch(() => {});
      await tempTransport.close().catch(() => {});
    }
    return;
  }

  console.warn(`[request] Rejected POST: sessionId=${sessionId || 'none'}, isInit=${isInitializeRequest(req.body)}, body.method=${req.body?.method}`);
  res.status(400).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Bad Request: missing session ID or not an initialize request' },
    id: req.body?.id ?? null,
  });
});

// GET /mcp — SSE stream with keepalive
app.get('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).json({ error: 'Invalid or missing session ID' });
    return;
  }

  const session = sessions.get(sessionId)!;
  session.lastActivity = Date.now();
  console.log(`[sse] Stream opened for session ${sessionId}`);

  // Start keepalive pings to prevent CloudFront idle timeout
  let keepaliveCount = 0;
  const keepalive = setInterval(() => {
    if (!res.writableEnded) {
      try {
        res.write(': keepalive\n\n');
        keepaliveCount++;
        session.lastActivity = Date.now();
        if (keepaliveCount % 4 === 0) {
          console.log(`[sse] Keepalive #${keepaliveCount} sent for session ${sessionId}`);
        }
      } catch (err) {
        console.error(`[sse] Keepalive write failed for session ${sessionId}:`, err);
        clearInterval(keepalive);
      }
    } else {
      console.log(`[sse] Stream ended (writableEnded) for session ${sessionId} after ${keepaliveCount} keepalives`);
      clearInterval(keepalive);
    }
  }, KEEPALIVE_INTERVAL_MS);

  res.on('close', () => {
    console.log(`[sse] Stream closed by client for session ${sessionId} after ${keepaliveCount} keepalives`);
    clearInterval(keepalive);
  });

  res.on('error', (err) => {
    console.error(`[sse] Stream error for session ${sessionId}:`, err.message);
    clearInterval(keepalive);
  });

  await session.transport.handleRequest(req, res);
});

// DELETE /mcp — session cleanup
app.delete('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).json({ error: 'Invalid or missing session ID' });
    return;
  }

  const session = sessions.get(sessionId)!;
  await session.transport.handleRequest(req, res);
  await session.server.close().catch(() => {});
  sessions.delete(sessionId);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`MCP server listening on http://0.0.0.0:${PORT}`);
});

// Graceful shutdown
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    console.log(`Received ${signal}, shutting down...`);
    for (const [, session] of sessions) {
      await session.transport.close().catch(() => {});
      await session.server.close().catch(() => {});
    }
    sessions.clear();
    server.close(() => process.exit(0));
  });
}
