import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyScopes, signJwt, verifyJwt } from './auth.js';

vi.stubEnv('JWT_SECRET', 'test-secret-key-for-vitest-at-least-32-chars');

describe('verifyScopes', () => {
  it('returns all required scopes when input is undefined', () => {
    const missing = verifyScopes(undefined);
    expect(missing).toContain('https://www.googleapis.com/auth/drive.file');
    expect(missing).not.toContain('https://www.googleapis.com/auth/drive.readonly');
  });

  it('returns empty array when all scopes granted', () => {
    const granted = 'openid email profile https://www.googleapis.com/auth/drive.file';
    expect(verifyScopes(granted)).toEqual([]);
  });

  it('returns empty array when drive.readonly also granted', () => {
    const granted = 'openid email profile https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';
    expect(verifyScopes(granted)).toEqual([]);
  });

  it('returns missing drive.file when only drive.readonly granted', () => {
    const granted = 'openid email profile https://www.googleapis.com/auth/drive.readonly';
    const missing = verifyScopes(granted);
    expect(missing).toEqual(['https://www.googleapis.com/auth/drive.file']);
  });
});

describe('signJwt / verifyJwt', () => {
  it('round-trips payload correctly', async () => {
    const payload = { sub: '123', email: 'test@example.com', name: 'Test User' };
    const token = await signJwt(payload);
    const decoded = await verifyJwt(token);
    expect(decoded.sub).toBe('123');
    expect(decoded.email).toBe('test@example.com');
    expect(decoded.name).toBe('Test User');
  });

  it('preserves isAdmin in payload', async () => {
    const payload = { sub: '123', email: 'admin@example.com', name: 'Admin', isAdmin: true };
    const token = await signJwt(payload);
    const decoded = await verifyJwt(token);
    expect(decoded.isAdmin).toBe(true);
  });

  it('rejects tampered token', async () => {
    const token = await signJwt({ sub: '123', email: 'a@b.com', name: 'A' });
    const tampered = token.slice(0, -5) + 'xxxxx';
    await expect(verifyJwt(tampered)).rejects.toThrow();
  });
});
