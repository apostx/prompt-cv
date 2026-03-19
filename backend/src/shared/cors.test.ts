import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('cors', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function importCors(corsOrigins?: string) {
    if (corsOrigins !== undefined) {
      vi.stubEnv('CORS_ORIGINS', corsOrigins);
    } else {
      delete process.env.CORS_ORIGINS;
    }
    return await import('./cors.js');
  }

  it('returns * when CORS_ORIGINS is not set', async () => {
    const { getCorsHeaders } = await importCors(undefined);
    const headers = getCorsHeaders('https://example.com');
    expect(headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('returns matching origin from allowed list', async () => {
    const { getCorsHeaders } = await importCors('https://foo.com,https://bar.com');
    const headers = getCorsHeaders('https://bar.com');
    expect(headers['Access-Control-Allow-Origin']).toBe('https://bar.com');
  });

  it('returns first origin when request origin not in list', async () => {
    const { getCorsHeaders } = await importCors('https://foo.com,https://bar.com');
    const headers = getCorsHeaders('https://unknown.com');
    expect(headers['Access-Control-Allow-Origin']).toBe('https://foo.com');
  });

  it('optionsResponse returns 204 with CORS headers', async () => {
    const { optionsResponse } = await importCors(undefined);
    const response = optionsResponse() as { statusCode: number; headers: Record<string, string> };
    expect(response.statusCode).toBe(204);
    expect(response.headers).toHaveProperty('Access-Control-Allow-Origin');
    expect(response.headers).toHaveProperty('Access-Control-Allow-Methods');
  });
});
