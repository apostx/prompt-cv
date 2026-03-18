import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { updateDocumentFromHtml } from '../services/google-docs.js';
import { generateCv } from '../services/cv-generation.js';
import { optimizeCv } from '../services/cv-optimizer.js';
import { optionsResponse } from '../shared/cors.js';
import { jsonResponse } from '../shared/response.js';
import { handleError } from '../shared/errors.js';
import { cvGenerateRequestSchema, optimizeRequestSchema, docUpdateRequestSchema } from '../shared/validation.js';

function parseBody(event: APIGatewayProxyEventV2): unknown {
  if (!event.body) return null;
  return JSON.parse(event.body);
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const path = event.rawPath || '/';

  if (event.requestContext.http.method === 'OPTIONS') {
    return optionsResponse();
  }

  try {
    const method = event.requestContext.http.method;

    if ((path === '/cv/generate' || path === '/cv') && method === 'POST') {
      return await handleGenerate(event);
    }

    if (path === '/cv/optimize' && method === 'POST') {
      return await handleOptimize(event);
    }

    if (path === '/cv' && method === 'GET') {
      return jsonResponse(200, {
        service: 'Prompt CV API',
        endpoints: {
          'POST /cv/generate': 'Generate CV from template + data',
          'POST /cv/optimize': 'Optimize CV to fit within 2 pages',
          'PUT /docs/:id/html': 'Update Google Doc from HTML with indentation fix',
        },
      });
    }

    const docsHtmlMatch = path.match(/^\/docs\/([^/]+)\/html$/);
    if (docsHtmlMatch && method === 'PUT') {
      return await handleUpdateDocHtml(event, docsHtmlMatch[1]);
    }

    return jsonResponse(404, { error: 'Not found' });
  } catch (error) {
    const { statusCode, body } = handleError(error);
    return jsonResponse(statusCode, body);
  }
}

async function handleOptimize(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  let body: unknown;
  try { body = parseBody(event); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }
  if (!body) return jsonResponse(400, { error: 'Request body required' });

  const parsed = optimizeRequestSchema.safeParse(body);
  if (!parsed.success) return jsonResponse(400, { error: 'Invalid request', details: parsed.error.issues });

  const result = await optimizeCv(parsed.data.documentId);
  return jsonResponse(200, result);
}

async function handleUpdateDocHtml(
  event: APIGatewayProxyEventV2,
  documentId: string,
): Promise<APIGatewayProxyResultV2> {
  let body: unknown;
  try { body = parseBody(event); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }
  if (!body) return jsonResponse(400, { error: 'Request body required' });

  const parsed = docUpdateRequestSchema.safeParse(body);
  if (!parsed.success) return jsonResponse(400, { error: 'Invalid request', details: parsed.error.issues });

  await updateDocumentFromHtml(documentId, parsed.data.content);
  return jsonResponse(200, { success: true, documentId });
}

async function handleGenerate(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  let body: unknown;
  try { body = parseBody(event); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }
  if (!body) return jsonResponse(400, { error: 'Request body required' });

  const parsed = cvGenerateRequestSchema.safeParse(body);
  if (!parsed.success) return jsonResponse(400, { error: 'Invalid request', details: parsed.error.issues });

  const result = await generateCv({
    templateDocId: parsed.data.templateDocId,
    data: parsed.data.data,
  });

  return jsonResponse(200, result);
}
