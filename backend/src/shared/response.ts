import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { getCorsHeaders } from './cors.js';

export function jsonResponse(statusCode: number, body: unknown, requestOrigin?: string): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      ...getCorsHeaders(requestOrigin),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body, null, 2),
  };
}
