import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.SESSIONS_TABLE || 'prompt-cv-sessions';
const TTL_SECONDS = 60 * 60; // 1 hour

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

class SessionStore {
  async create(): Promise<CvSession> {
    const now = Date.now();
    const session: CvSession = {
      id: randomUUID(),
      data: {},
      createdAt: now,
      updatedAt: now,
    };
    await client.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        sessionId: session.id,
        data: JSON.stringify(session.data),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        expiresAt: Math.floor(now / 1000) + TTL_SECONDS,
      },
    }));
    console.log(`[session-store] Created session ${session.id}`);
    return session;
  }

  async get(id: string): Promise<CvSession | undefined> {
    const result = await client.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { sessionId: id },
    }));
    if (!result.Item) return undefined;
    return {
      id: result.Item.sessionId as string,
      data: JSON.parse(result.Item.data as string),
      createdAt: result.Item.createdAt as number,
      updatedAt: result.Item.updatedAt as number,
    };
  }

  async update(id: string, data: Record<string, unknown>): Promise<CvSession> {
    const session = await this.get(id);
    if (!session) throw new Error(`Session ${id} not found`);
    session.data = deepMerge(session.data, data);
    session.updatedAt = Date.now();
    await client.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        sessionId: session.id,
        data: JSON.stringify(session.data),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        expiresAt: Math.floor(session.updatedAt / 1000) + TTL_SECONDS,
      },
    }));
    return session;
  }

  async delete(id: string): Promise<void> {
    await client.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { sessionId: id },
    }));
  }
}

export const sessionStore = new SessionStore();
