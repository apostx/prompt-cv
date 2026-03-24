import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

import { corsHeaders } from '../shared/cors.js';
import { jsonResponse } from '../shared/response.js';
import { createServer } from '../mcp/server.js';
import { authenticateMcpRequest } from '../mcp/auth.js';

let globalWarm = false;

function toWebRequest(event: APIGatewayProxyEventV2): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(event.headers || {})) {
    if (value) headers.set(key, value);
  }

  const url = `https://${event.requestContext.domainName}${event.rawPath}${event.rawQueryString ? '?' + event.rawQueryString : ''}`;
  const method = event.requestContext.http.method;

  return new Request(url, {
    method,
    headers,
    body: method !== 'GET' && method !== 'HEAD' ? (event.body ?? null) : null,
  });
}

async function fromWebResponse(response: Response): Promise<APIGatewayProxyResultV2> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  Object.assign(headers, corsHeaders);

  const body = await response.text();

  return {
    statusCode: response.status,
    headers,
    body,
  };
}

function logRequest(method: string, path: string, coldStart: boolean, mcpMethod?: string) {
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({
    event: 'request', method, path, coldStart, mcpMethod, timestamp: new Date().toISOString(),
  }));
}

function logResponse(method: string, path: string, statusCode: number, durationMs: number, coldStart: boolean) {
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({
    event: 'response', method, path, statusCode, durationMs, coldStart,
  }));
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const startTime = Date.now();
  const isColdStart = !globalWarm;
  globalWarm = true;

  const path = event.rawPath || '/';
  const method = event.requestContext.http.method;

  let mcpMethod: string | undefined;
  if (method === 'POST' && event.body) {
    try { mcpMethod = JSON.parse(event.body).method; } catch { /* ignore */ }
  }
  logRequest(method, path, isColdStart, mcpMethod);

  if (method === 'OPTIONS') {
    const result = { statusCode: 204, headers: corsHeaders, body: '' };
    logResponse(method, path, 204, Date.now() - startTime, isColdStart);
    return result;
  }

  // Health check
  if (path === '/health' && method === 'GET') {
    logResponse(method, path, 200, Date.now() - startTime, isColdStart);
    return jsonResponse(200, { status: 'ok' });
  }

  // OAuth metadata discovery (for MCP clients)
  if (path === '/.well-known/oauth-authorization-server' && method === 'GET') {
    const apiUrl = process.env.AUTH_API_URL || '';
    logResponse(method, path, 200, Date.now() - startTime, isColdStart);
    return jsonResponse(200, {
      issuer: apiUrl,
      authorization_endpoint: `${apiUrl}/oauth/authorize`,
      token_endpoint: `${apiUrl}/oauth/token`,
      registration_endpoint: `${apiUrl}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
    });
  }

  // POST /mcp — MCP endpoint
  if (path === '/mcp' && method === 'POST') {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      logResponse(method, path, 401, Date.now() - startTime, isColdStart);
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Unauthorized: Bearer token required' },
          id: null,
        }),
      };
    }

    const auth = await authenticateMcpRequest(authHeader.slice(7));
    if (!auth.success) {
      logResponse(method, path, auth.status, Date.now() - startTime, isColdStart);
      return {
        statusCode: auth.status,
        headers: corsHeaders,
        body: JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: auth.message },
          id: null,
        }),
      };
    }

    const server = createServer(auth.options);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await server.connect(transport);

    try {
      const request = toWebRequest(event);
      const response = await transport.handleRequest(request, {
        parsedBody: event.body ? JSON.parse(event.body) : undefined,
      });
      const result = await fromWebResponse(response);
      const status = typeof result === 'string' ? 200 : (result.statusCode ?? 200);
      logResponse(method, path, status, Date.now() - startTime, isColdStart);
      return result;
    } catch (err) {
      console.error('MCP handler error:', err);
      logResponse(method, path, 500, Date.now() - startTime, isColdStart);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Internal server error' }),
      };
    } finally {
      await transport.close();
      await server.close();
    }
  }

  logResponse(method, path, 404, Date.now() - startTime, isColdStart);
  return jsonResponse(404, { error: 'Not found' });
}
