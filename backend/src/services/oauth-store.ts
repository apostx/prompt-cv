import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const CLIENTS_TABLE = process.env.OAUTH_CLIENTS_TABLE || 'prompt-cv-oauth-clients';
const CODES_TABLE = process.env.OAUTH_CODES_TABLE || 'prompt-cv-oauth-codes';
const TOKENS_TABLE = process.env.OAUTH_TOKENS_TABLE || 'prompt-cv-oauth-tokens';

// --- Dynamic Client Registration ---

export interface OAuthClient {
  clientId: string;
  redirectUri: string;
  clientName: string;
  createdAt: string;
}

export async function registerClient(name: string, redirectUri: string): Promise<OAuthClient> {
  const item: OAuthClient = {
    clientId: randomUUID(),
    redirectUri,
    clientName: name,
    createdAt: new Date().toISOString(),
  };
  await client.send(new PutCommand({ TableName: CLIENTS_TABLE, Item: item }));
  return item;
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  const result = await client.send(new GetCommand({ TableName: CLIENTS_TABLE, Key: { clientId } }));
  return (result.Item as OAuthClient) || null;
}

// --- Authorization Codes ---

export interface AuthCode {
  code: string;
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge?: string;
  expiresAt: number;
}

export async function saveAuthCode(params: Omit<AuthCode, 'code' | 'expiresAt'>): Promise<string> {
  const code = randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + 600; // 10 min TTL
  await client.send(new PutCommand({
    TableName: CODES_TABLE,
    Item: { code, ...params, expiresAt },
  }));
  return code;
}

export async function consumeAuthCode(code: string): Promise<AuthCode | null> {
  const result = await client.send(new GetCommand({ TableName: CODES_TABLE, Key: { code } }));
  if (!result.Item) return null;
  await client.send(new DeleteCommand({ TableName: CODES_TABLE, Key: { code } }));
  const item = result.Item as AuthCode;
  if (item.expiresAt < Math.floor(Date.now() / 1000)) return null;
  return item;
}

// --- Access Tokens (opaque, for MCP) ---

export interface AccessToken {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: number;
}

export async function saveAccessToken(userId: string): Promise<string> {
  const token = randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 3600; // 7 days
  await client.send(new PutCommand({
    TableName: TOKENS_TABLE,
    Item: { token, userId, createdAt: new Date().toISOString(), expiresAt },
  }));
  return token;
}

export async function getUserByAccessToken(token: string): Promise<string | null> {
  const result = await client.send(new GetCommand({ TableName: TOKENS_TABLE, Key: { token } }));
  if (!result.Item) return null;
  const item = result.Item as AccessToken;
  if (item.expiresAt < Math.floor(Date.now() / 1000)) return null;
  return item.userId;
}
