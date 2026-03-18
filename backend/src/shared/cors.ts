import type { APIGatewayProxyResultV2 } from 'aws-lambda';

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim());

export function getCorsHeaders(requestOrigin?: string): Record<string, string> {
  let origin: string;
  if (ALLOWED_ORIGINS.includes('*')) {
    origin = '*';
  } else if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
    origin = requestOrigin;
  } else {
    origin = ALLOWED_ORIGINS[0];
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, Mcp-Session-Id, Mcp-Protocol-Version',
  };
}

/** @deprecated Use getCorsHeaders(origin) for dynamic origin support */
export const corsHeaders = getCorsHeaders();

export function optionsResponse(requestOrigin?: string): APIGatewayProxyResultV2 {
  return { statusCode: 204, headers: getCorsHeaders(requestOrigin), body: '' };
}
