import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { google } from 'googleapis';
import type { docs_v1 } from 'googleapis';


const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.USERS_TABLE || 'prompt-cv-users';

export interface UserSettings {
  folderPath?: string;
  contextDocId?: string;
  instructionsDocId?: string;
  templateDocId?: string;
}

export interface User {
  userId: string;
  email: string;
  name: string;
  googleAccessToken: string;
  googleRefreshToken: string;
  googleTokenExpiry: number;
  settings: UserSettings;
  isAdmin?: boolean;
  cvsGenerated?: number;
  createdAt: string;
  updatedAt: string;
}

export async function saveUser(user: Omit<User, 'createdAt' | 'updatedAt'> & { createdAt?: string }): Promise<void> {
  const now = new Date().toISOString();
  await client.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      ...user,
      settings: user.settings || {},
      createdAt: user.createdAt || now,
      updatedAt: now,
    },
  }));
}

export async function getUser(userId: string): Promise<User | null> {
  const result = await client.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { userId },
  }));
  return (result.Item as User) || null;
}

export async function updateUserSettings(userId: string, settings: UserSettings): Promise<void> {
  const user = await getUser(userId);
  if (!user) throw new Error('User not found');
  const cleaned = Object.fromEntries(
    Object.entries(settings).filter(([, v]) => v !== undefined),
  );
  const merged = { ...user.settings, ...cleaned };
  await saveUser({ ...user, settings: merged });
}

export async function incrementCvCount(userId: string): Promise<void> {
  await client.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { userId },
    UpdateExpression: 'ADD cvsGenerated :one',
    ExpressionAttributeValues: { ':one': 1 },
  }));
}

export async function getPublicStats(): Promise<{ userCount: number; totalCvsGenerated: number }> {
  const result = await client.send(new ScanCommand({
    TableName: TABLE_NAME,
    ProjectionExpression: 'cvsGenerated',
  }));
  const items = result.Items || [];
  return {
    userCount: items.length,
    totalCvsGenerated: items.reduce((sum, item) => sum + ((item.cvsGenerated as number) || 0), 0),
  };
}

export async function getAllUsersAdmin(): Promise<{ email: string; name: string; cvsGenerated: number; createdAt: string }[]> {
  const result = await client.send(new ScanCommand({
    TableName: TABLE_NAME,
    ProjectionExpression: 'email, #n, cvsGenerated, createdAt',
    ExpressionAttributeNames: { '#n': 'name' },
  }));
  return (result.Items || []).map(item => ({
    email: item.email as string,
    name: item.name as string,
    cvsGenerated: (item.cvsGenerated as number) || 0,
    createdAt: item.createdAt as string,
  }));
}

export interface GoogleClients {
  docs: docs_v1.Docs;
  drive: ReturnType<typeof google.drive>;
}

export async function getGoogleClientsForUser(userId: string): Promise<GoogleClients> {
  const user = await getUser(userId);
  if (!user) throw new Error('User not found');

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
    expiry_date: user.googleTokenExpiry,
  });

  // Persist refreshed tokens back to DynamoDB
  oauth2Client.on('tokens', async (tokens) => {
    try {
      const updates: Partial<User> = {};
      if (tokens.access_token) updates.googleAccessToken = tokens.access_token;
      if (tokens.expiry_date) updates.googleTokenExpiry = tokens.expiry_date;
      if (Object.keys(updates).length > 0) {
        await saveUser({ ...user, ...updates });
      }
    } catch (err) {
      console.error('[token-refresh] Failed to persist refreshed token:', err);
    }
  });

  return {
    docs: google.docs({ version: 'v1', auth: oauth2Client }),
    drive: google.drive({ version: 'v3', auth: oauth2Client }),
  };
}
