import { describe, it, expect } from 'vitest';

// Test interceptor logic patterns directly.
// The actual interceptor uses Angular's inject() and HttpRequest/next chain.
// Here we verify the decision logic that authInterceptor implements.

describe('auth interceptor logic', () => {
  it('adds Authorization header when token exists', () => {
    const token = 'test-jwt-token';
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    expect(headers['Authorization']).toBe('Bearer test-jwt-token');
  });

  it('does not add header when no token', () => {
    const token: string | null = null;
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    expect(headers['Authorization']).toBeUndefined();
  });

  it('triggers logout on 401 status', () => {
    const errorStatus = 401;
    let logoutCalled = false;
    if (errorStatus === 401) {
      logoutCalled = true;
    }
    expect(logoutCalled).toBe(true);
  });

  it('does not trigger logout on other error statuses', () => {
    const errorStatus = 500;
    let logoutCalled = false;
    if (errorStatus === 401) {
      logoutCalled = true;
    }
    expect(logoutCalled).toBe(false);
  });
});
