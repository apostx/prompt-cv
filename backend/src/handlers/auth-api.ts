import { createHash } from 'node:crypto';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getGoogleAuthUrl, exchangeCodeForTokens, getUserInfo, signJwt, verifyJwt, verifyScopes, revokeGoogleToken } from '../services/auth.js';
import { saveUser, getUser, getPublicStats } from '../services/user-store.js';
import {
  registerClient,
  saveAuthCode,
  consumeAuthCode,
  saveAccessToken,
  saveMcpSetup,
  consumeMcpSetup,
} from '../services/oauth-store.js';
import { optionsResponse } from '../shared/cors.js';
import { jsonResponse } from '../shared/response.js';
import { configStore } from '../services/config-store.js';

const API_URL = process.env.API_URL || '';
const FRONTEND_URL = process.env.FRONTEND_URL || '';
const MCP_URL = process.env.MCP_URL || '';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const path = event.rawPath || '/';
  const method = event.requestContext.http.method;

  if (method === 'OPTIONS') return optionsResponse();

  try {
    // --- Public ---
    if (path === '/config' && method === 'GET') return await handleConfig(event);
    if (path === '/stats' && method === 'GET') return handleStats(event);

    // --- Web Auth ---
    if (path === '/auth/google' && method === 'GET') return handleWebLogin(event);
    if (path === '/auth/google/callback' && method === 'GET') return handleWebCallback(event);
    if (path === '/auth/revoke' && method === 'POST') return handleRevoke(event);

    // --- MCP OAuth Discovery ---
    if ((path === '/.well-known/oauth-authorization-server' || path === '/.well-known/oauth-authorization-server/mcp') && method === 'GET') {
      return handleOAuthMetadata();
    }

    // --- MCP OAuth ---
    if (path === '/oauth/register' && method === 'POST') return handleRegister(event);
    if (path === '/oauth/authorize' && method === 'GET') return handleAuthorize(event);
    if (path === '/oauth/callback' && method === 'GET') return handleOAuthCallback(event);
    if (path === '/oauth/token' && method === 'POST') return handleToken(event);
    if (path === '/oauth/mcp-setup' && method === 'GET') return handleMcpSetup(event);

    return jsonResponse(404, { error: 'Not found' });
  } catch (error) {
    console.error('Auth handler error:', error);
    return jsonResponse(500, { error: error instanceof Error ? error.message : 'Internal server error' });
  }
}

// --- Public ---

let configCache: { data: Record<string, string>; expiresAt: number } | null = null;

async function handleConfig(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const origin = event.headers?.origin;
  if (!configCache || Date.now() > configCache.expiresAt) {
    const promptKeys = ['login-prompt-step3', 'login-prompt-step4', 'login-prompt-step5a', 'login-prompt-step5b'];
    configCache = { data: await configStore.getMultiple(promptKeys), expiresAt: Date.now() + 5 * 60_000 };
  }
  return jsonResponse(200, {
    mcpUrl: MCP_URL,
    prompts: {
      step3: configCache.data['login-prompt-step3'] || null,
      step4: configCache.data['login-prompt-step4'] || null,
      step5a: configCache.data['login-prompt-step5a'] || null,
      step5b: configCache.data['login-prompt-step5b'] || null,
    },
  }, origin);
}

let statsCache: { data: { userCount: number; totalCvsGenerated: number }; expiresAt: number } | null = null;

async function handleStats(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const origin = event.headers?.origin;
  if (!statsCache || Date.now() > statsCache.expiresAt) {
    statsCache = { data: await getPublicStats(), expiresAt: Date.now() + 5 * 60_000 };
  }
  return jsonResponse(200, statsCache.data, origin);
}

// --- Web Auth Handlers ---

function handleWebLogin(_event: APIGatewayProxyEventV2): APIGatewayProxyResultV2 {
  const redirectUri = `${API_URL}/auth/google/callback`;
  const state = JSON.stringify({ type: 'web' });
  const url = getGoogleAuthUrl(redirectUri, state);
  return { statusCode: 302, headers: { Location: url }, body: '' };
}

async function handleWebCallback(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const params = event.queryStringParameters || {};
  const code = params.code;
  if (!code) return jsonResponse(400, { error: 'Missing code parameter' });

  const redirectUri = `${API_URL}/auth/google/callback`;
  const tokens = await exchangeCodeForTokens(code, redirectUri);

  const missingScopes = verifyScopes(tokens.scope ?? undefined);
  if (missingScopes.length > 0) {
    return {
      statusCode: 302,
      headers: { Location: `${FRONTEND_URL}/login?error=missing_scopes` },
      body: '',
    };
  }

  const userInfo = await getUserInfo(tokens.access_token!);

  const existingUser = await getUser(userInfo.id);
  await saveUser({
    ...existingUser,
    userId: userInfo.id,
    email: userInfo.email,
    name: userInfo.name,
    googleAccessToken: tokens.access_token!,
    googleRefreshToken: tokens.refresh_token || '',
    googleTokenExpiry: tokens.expiry_date || Date.now() + 3600_000,
    settings: existingUser?.settings || {},
  });

  const jwt = await signJwt({ sub: userInfo.id, email: userInfo.email, name: userInfo.name, isAdmin: existingUser?.isAdmin || undefined });
  // Redirect to frontend with JWT in URL fragment
  return {
    statusCode: 302,
    headers: { Location: `${FRONTEND_URL}/auth/callback#token=${jwt}` },
    body: '',
  };
}

// --- Revoke Handler ---

async function handleRevoke(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const origin = event.headers?.origin;
  const authHeader = event.headers?.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'Missing authorization token' }, origin);
  }

  const jwt = authHeader.slice(7);
  const payload = await verifyJwt(jwt);
  const user = await getUser(payload.sub);
  if (!user) {
    return jsonResponse(404, { error: 'User not found' }, origin);
  }

  // Revoke Google refresh token (best-effort — still clear local tokens on failure)
  if (user.googleRefreshToken) {
    try {
      await revokeGoogleToken(user.googleRefreshToken);
    } catch (err) {
      console.warn('Google token revocation failed (continuing):', err);
    }
  }

  // Clear Google tokens from user record
  await saveUser({
    ...user,
    googleAccessToken: '',
    googleRefreshToken: '',
    googleTokenExpiry: 0,
  });

  return jsonResponse(200, { message: 'Account disconnected' }, origin);
}

// --- MCP OAuth Handlers ---

function handleOAuthMetadata(): APIGatewayProxyResultV2 {
  return jsonResponse(200, {
    issuer: API_URL,
    authorization_endpoint: `${API_URL}/oauth/authorize`,
    token_endpoint: `${API_URL}/oauth/token`,
    registration_endpoint: `${API_URL}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
  });
}

async function handleRegister(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (!event.body) return jsonResponse(400, { error: 'Body required' });
  const body = JSON.parse(event.body);
  const name = body.client_name || 'MCP Client';
  const redirectUri = body.redirect_uris?.[0];
  if (!redirectUri) return jsonResponse(400, { error: 'redirect_uris required' });

  const client = await registerClient(name, redirectUri);
  return jsonResponse(201, {
    client_id: client.clientId,
    client_name: client.clientName,
    redirect_uris: [client.redirectUri],
  });
}

function handleAuthorize(event: APIGatewayProxyEventV2): APIGatewayProxyResultV2 {
  const params = event.queryStringParameters || {};
  const clientId = params.client_id;
  const redirectUri = params.redirect_uri;
  const state = params.state;
  const codeChallenge = params.code_challenge;

  if (!clientId || !redirectUri) {
    return jsonResponse(400, { error: 'client_id and redirect_uri required' });
  }

  // Store OAuth params in state and redirect to Google
  const googleCallbackUri = `${API_URL}/oauth/callback`;
  const oauthState = JSON.stringify({
    type: 'mcp',
    clientId,
    redirectUri,
    state: state || '',
    codeChallenge: codeChallenge || '',
  });
  const url = getGoogleAuthUrl(googleCallbackUri, oauthState);
  return { statusCode: 302, headers: { Location: url }, body: '' };
}

async function handleOAuthCallback(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const params = event.queryStringParameters || {};
  const code = params.code;
  const stateStr = params.state;
  if (!code || !stateStr) return jsonResponse(400, { error: 'Missing code or state' });

  const state = JSON.parse(stateStr);
  const { clientId, redirectUri, state: clientState, codeChallenge } = state;

  // Exchange Google code for tokens
  const googleCallbackUri = `${API_URL}/oauth/callback`;
  const tokens = await exchangeCodeForTokens(code, googleCallbackUri);

  const missingScopes = verifyScopes(tokens.scope ?? undefined);
  if (missingScopes.length > 0) {
    const separator = redirectUri.includes('?') ? '&' : '?';
    return {
      statusCode: 302,
      headers: { Location: `${redirectUri}${separator}error=access_denied&error_description=Missing+required+scopes` },
      body: '',
    };
  }

  const userInfo = await getUserInfo(tokens.access_token!);

  // Save/update user (preserve existing fields like isAdmin, cvsGenerated)
  const existingMcpUser = await getUser(userInfo.id);
  await saveUser({
    ...existingMcpUser,
    userId: userInfo.id,
    email: userInfo.email,
    name: userInfo.name,
    googleAccessToken: tokens.access_token!,
    googleRefreshToken: tokens.refresh_token || '',
    googleTokenExpiry: tokens.expiry_date || Date.now() + 3600_000,
    settings: existingMcpUser?.settings || {},
  });

  // Generate our authorization code
  const authCode = await saveAuthCode({
    userId: userInfo.id,
    clientId,
    redirectUri,
    codeChallenge: codeChallenge || undefined,
  });

  // First-time MCP users: redirect to frontend setup before completing connection
  const isNewUser = !existingMcpUser || (!existingMcpUser.settings?.initialized && !existingMcpUser.settings?.templateDocId);
  if (isNewUser && FRONTEND_URL) {
    const jwt = await signJwt({ sub: userInfo.id, email: userInfo.email, name: userInfo.name, isAdmin: existingMcpUser?.isAdmin || undefined });
    const setupToken = await saveMcpSetup({ jwt, authCode, redirectUri, state: clientState });
    return {
      statusCode: 302,
      headers: { Location: `${FRONTEND_URL}/auth/callback#mcpSetup=${setupToken}` },
      body: '',
    };
  }

  // Redirect back to MCP client with our auth code
  const separator = redirectUri.includes('?') ? '&' : '?';
  const location = `${redirectUri}${separator}code=${authCode}${clientState ? `&state=${encodeURIComponent(clientState)}` : ''}`;
  return { statusCode: 302, headers: { Location: location }, body: '' };
}

async function handleToken(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (!event.body) return jsonResponse(400, { error: 'Body required' });

  // Decode base64 body if needed (API Gateway encodes form-urlencoded)
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf-8')
    : event.body;

  // Parse both form-urlencoded and JSON
  let body: Record<string, string>;
  const contentType = event.headers['content-type'] || '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    body = Object.fromEntries(new URLSearchParams(rawBody));
  } else {
    body = JSON.parse(rawBody);
  }

  const grantType = body.grant_type;
  if (grantType !== 'authorization_code') {
    return jsonResponse(400, { error: 'unsupported_grant_type' });
  }

  const code = body.code;
  if (!code) return jsonResponse(400, { error: 'Missing code' });

  const authCode = await consumeAuthCode(code);
  if (!authCode) return jsonResponse(400, { error: 'invalid_grant', error_description: 'Invalid or expired authorization code' });

  // Verify PKCE if code_challenge was provided
  if (authCode.codeChallenge) {
    const codeVerifier = body.code_verifier;
    if (!codeVerifier) return jsonResponse(400, { error: 'invalid_grant', error_description: 'code_verifier required' });
    const hash = createHash('sha256').update(codeVerifier).digest('base64url');
    if (hash !== authCode.codeChallenge) {
      return jsonResponse(400, { error: 'invalid_grant', error_description: 'code_verifier mismatch' });
    }
  }

  // Issue access token
  const accessToken = await saveAccessToken(authCode.userId);

  return jsonResponse(200, {
    access_token: accessToken,
    token_type: 'Bearer',
  });
}

async function handleMcpSetup(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const origin = event.headers?.origin;
  const token = event.queryStringParameters?.token;
  if (!token) return jsonResponse(400, { error: 'Missing token' }, origin);

  const setup = await consumeMcpSetup(token);
  if (!setup) return jsonResponse(404, { error: 'Setup token not found or expired' }, origin);

  return jsonResponse(200, {
    jwt: setup.jwt,
    code: setup.authCode,
    redirectUri: setup.redirectUri,
    state: setup.state,
  }, origin);
}
