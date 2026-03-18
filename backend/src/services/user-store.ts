import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { google } from 'googleapis';
import type { docs_v1 } from 'googleapis';
import { refreshGoogleToken } from './auth.js';

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
  });

  // Auto-refresh if expired
  if (Date.now() >= user.googleTokenExpiry) {
    const credentials = await refreshGoogleToken(user.googleRefreshToken);
    oauth2Client.setCredentials(credentials);
    await saveUser({
      ...user,
      googleAccessToken: credentials.access_token || user.googleAccessToken,
      googleTokenExpiry: credentials.expiry_date || Date.now() + 3600_000,
    });
  }

  return {
    docs: google.docs({ version: 'v1', auth: oauth2Client }),
    drive: google.drive({ version: 'v3', auth: oauth2Client }),
  };
}
