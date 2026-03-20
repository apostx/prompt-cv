import { google } from 'googleapis';
import { SignJWT, jwtVerify } from 'jose';

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
];

const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
];

export function verifyScopes(grantedScopes: string | undefined): string[] {
  if (!grantedScopes) return REQUIRED_SCOPES;
  const granted = grantedScopes.split(' ');
  return REQUIRED_SCOPES.filter(s => !granted.includes(s));
}

function getOAuth2Client(redirectUri?: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getGoogleAuthUrl(redirectUri: string, state: string): string {
  const client = getOAuth2Client(redirectUri);
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  });
}

export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const client = getOAuth2Client(redirectUri);
  const { tokens } = await client.getToken(code);
  return tokens;
}

export async function getUserInfo(accessToken: string) {
  const client = getOAuth2Client();
  client.setCredentials({ access_token: accessToken });
  const res = await google.oauth2({ version: 'v2', auth: client }).userinfo.get();
  return {
    id: res.data.id!,
    email: res.data.email!,
    name: res.data.name || res.data.email!,
  };
}

export async function refreshGoogleToken(refreshToken: string) {
  const client = getOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();
  return credentials;
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Missing JWT_SECRET');
  return new TextEncoder().encode(secret);
}

export async function signJwt(payload: { sub: string; email: string; name: string; isAdmin?: boolean }): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getJwtSecret());
}

export async function verifyJwt(token: string): Promise<{ sub: string; email: string; name: string; isAdmin?: boolean }> {
  const { payload } = await jwtVerify(token, getJwtSecret());
  return payload as { sub: string; email: string; name: string; isAdmin?: boolean };
}

export async function revokeGoogleToken(token: string): Promise<void> {
  const res = await fetch(
    `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
  );
  if (!res.ok && res.status !== 400) {
    throw new Error(`Google token revocation failed: ${res.status}`);
  }
}
