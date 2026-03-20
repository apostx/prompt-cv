import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.SESSIONS_TABLE || 'prompt-cv-sessions';
const TTL_SECONDS = 60 * 60; // 1 hour
const MAX_SESSIONS_PER_USER = 20;

export interface CvSession {
  id: string;
  userId: string;
  data: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function deepMerge(
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
  async create(userId: string): Promise<CvSession> {
    const count = await this.countForUser(userId);
    if (count >= MAX_SESSIONS_PER_USER) {
      throw new Error(`Session limit reached (${MAX_SESSIONS_PER_USER}). Use reset_sessions to clean up active sessions.`);
    }

    const now = Date.now();
    const session: CvSession = {
      id: randomUUID(),
      userId,
      data: {},
      createdAt: now,
      updatedAt: now,
    };
    await client.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        sessionId: session.id,
        userId: session.userId,
        data: JSON.stringify(session.data),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        expiresAt: Math.floor(now / 1000) + TTL_SECONDS,
      },
    }));
    console.log(`[session-store] Created session ${session.id} for user ${userId}`);
    return session;
  }

  async get(id: string, userId: string): Promise<CvSession | undefined> {
    const result = await client.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { sessionId: id },
    }));
    if (!result.Item) return undefined;
    if (result.Item.userId !== userId) return undefined;
    return {
      id: result.Item.sessionId as string,
      userId: result.Item.userId as string,
      data: JSON.parse(result.Item.data as string),
      createdAt: result.Item.createdAt as number,
      updatedAt: result.Item.updatedAt as number,
    };
  }

  async update(id: string, userId: string, data: Record<string, unknown>): Promise<CvSession> {
    const session = await this.get(id, userId);
    if (!session) throw new Error(`Session ${id} not found`);
    session.data = deepMerge(session.data, data);
    session.updatedAt = Date.now();
    await client.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        sessionId: session.id,
        userId: session.userId,
        data: JSON.stringify(session.data),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        expiresAt: Math.floor(session.updatedAt / 1000) + TTL_SECONDS,
      },
    }));
    return session;
  }

  async delete(id: string, userId: string): Promise<void> {
    const session = await this.get(id, userId);
    if (!session) return;
    await client.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { sessionId: id },
    }));
  }

  async countForUser(userId: string): Promise<number> {
    const result = await client.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
      Select: 'COUNT',
    }));
    return result.Count ?? 0;
  }

  async deleteAllForUser(userId: string): Promise<number> {
    const result = await client.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
      ProjectionExpression: 'sessionId',
    }));
    const items = result.Items ?? [];
    await Promise.all(items.map(item =>
      client.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { sessionId: item.sessionId },
      })),
    ));
    return items.length;
  }
}

export const sessionStore = new SessionStore();
