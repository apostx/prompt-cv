import { randomUUID } from 'node:crypto';

export interface CvSession {
  id: string;
  data: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (isPlainObject(result[key]) && isPlainObject(source[key])) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>,
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

class SessionStore {
  private sessions = new Map<string, CvSession>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  create(): CvSession {
    const session: CvSession = {
      id: randomUUID(),
      data: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.sessions.set(session.id, session);
    console.log(`[session-store] Created session ${session.id}`);
    return session;
  }

  get(id: string): CvSession | undefined {
    return this.sessions.get(id);
  }

  update(id: string, data: Record<string, unknown>): CvSession {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Session ${id} not found`);
    session.data = deepMerge(session.data, data);
    session.updatedAt = Date.now();
    return session;
  }

  delete(id: string): void {
    this.sessions.delete(id);
  }

  private cleanup(): void {
    const now = Date.now();
    let removed = 0;
    for (const [id, session] of this.sessions) {
      if (now - session.updatedAt > TTL_MS) {
        this.sessions.delete(id);
        removed++;
      }
    }
    if (removed > 0) {
      console.log(`[session-store] Cleaned up ${removed} expired session(s), ${this.sessions.size} remaining`);
    }
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

export const sessionStore = new SessionStore();
