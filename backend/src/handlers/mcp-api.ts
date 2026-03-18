import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

import { corsHeaders } from '../shared/cors.js';
import { createServer } from '../mcp/server.js';

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

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext.http.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  const server = createServer();
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
    return fromWebResponse(response);
  } catch (err) {
    console.error('MCP handler error:', err);
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
