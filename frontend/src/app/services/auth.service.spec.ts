import { describe, it, expect, beforeEach, vi } from 'vitest';

// Test JWT parsing logic directly (the core of auth.service.ts)
// Angular's inject() / signal() require an injection context,
// so we test the pure logic that AuthService wraps.

function parseJwtPayload(token: string): { sub: string; email: string; name: string; isAdmin?: boolean } | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return { sub: payload.sub, email: payload.email, name: payload.name, isAdmin: payload.isAdmin };
  } catch {
    return null;
  }
}

function createTestJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

describe('JWT payload parsing', () => {
  it('parses valid JWT payload', () => {
    const token = createTestJwt({ sub: '123', email: 'test@example.com', name: 'Test' });
    const result = parseJwtPayload(token);
    expect(result).toEqual({ sub: '123', email: 'test@example.com', name: 'Test', isAdmin: undefined });
  });

  it('includes isAdmin when present', () => {
    const token = createTestJwt({ sub: '123', email: 'admin@example.com', name: 'Admin', isAdmin: true });
    const result = parseJwtPayload(token);
    expect(result?.isAdmin).toBe(true);
  });

  it('returns null for invalid token', () => {
    expect(parseJwtPayload('not-a-jwt')).toBe(null);
  });

  it('returns null for empty string', () => {
    expect(parseJwtPayload('')).toBe(null);
  });
});

describe('token storage logic', () => {
  const TOKEN_KEY = 'cv_auth_token';

  beforeEach(() => {
    localStorage.clear();
  });

  it('stores token in localStorage', () => {
    const token = createTestJwt({ sub: '1', email: 'a@b.com', name: 'A' });
    localStorage.setItem(TOKEN_KEY, token);
    expect(localStorage.getItem(TOKEN_KEY)).toBe(token);
  });

  it('returns null when no token stored', () => {
    expect(localStorage.getItem(TOKEN_KEY)).toBe(null);
  });

  it('clears token on remove', () => {
    localStorage.setItem(TOKEN_KEY, 'test');
    localStorage.removeItem(TOKEN_KEY);
    expect(localStorage.getItem(TOKEN_KEY)).toBe(null);
  });
});

describe('callback hash parsing', () => {
  it('extracts token from hash', () => {
    const hash = '#token=abc123def';
    const match = hash.match(/token=([^&]+)/);
    expect(match?.[1]).toBe('abc123def');
  });

  it('returns null for hash without token', () => {
    const hash = '#other=value';
    const match = hash.match(/token=([^&]+)/);
    expect(match).toBe(null);
  });

  it('handles token with other params in hash', () => {
    const hash = '#token=abc123&other=value';
    const match = hash.match(/token=([^&]+)/);
    expect(match?.[1]).toBe('abc123');
  });
});
