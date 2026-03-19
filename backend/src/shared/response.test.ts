import { describe, it, expect } from 'vitest';
import { jsonResponse } from './response.js';

type JsonResult = { statusCode: number; headers: Record<string, string>; body: string };

describe('jsonResponse', () => {
  it('returns correct statusCode', () => {
    const res = jsonResponse(200, { ok: true }) as JsonResult;
    expect(res.statusCode).toBe(200);
  });

  it('returns JSON-stringified body', () => {
    const res = jsonResponse(200, { message: 'hello' }) as JsonResult;
    expect(JSON.parse(res.body)).toEqual({ message: 'hello' });
  });

  it('includes Content-Type header', () => {
    const res = jsonResponse(200, {}) as JsonResult;
    expect(res.headers['Content-Type']).toBe('application/json');
  });

  it('includes CORS headers', () => {
    const res = jsonResponse(200, {}) as JsonResult;
    expect(res.headers).toHaveProperty('Access-Control-Allow-Origin');
  });

  it('passes request origin to CORS', () => {
    const res = jsonResponse(200, {}, 'https://example.com') as JsonResult;
    expect(res.headers).toHaveProperty('Access-Control-Allow-Origin');
  });
});
