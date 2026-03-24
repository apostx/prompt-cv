import { getUserByAccessToken } from '../services/oauth-store.js';
import { getGoogleClientsForUser, getUser } from '../services/user-store.js';
import type { McpServerOptions } from './server.js';

export interface AuthSuccess {
  success: true;
  options: McpServerOptions;
}

export interface AuthError {
  success: false;
  status: number;
  message: string;
}

export type AuthResult = AuthSuccess | AuthError;

export async function authenticateMcpRequest(token: string): Promise<AuthResult> {
  let userId: string | null;
  try {
    userId = await getUserByAccessToken(token);
  } catch (err) {
    console.error('[auth] Token lookup failed:', err);
    return { success: false, status: 401, message: 'Unauthorized: invalid token' };
  }

  if (!userId) {
    return { success: false, status: 401, message: 'Unauthorized: invalid or expired token' };
  }

  let clients;
  try {
    clients = await getGoogleClientsForUser(userId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    const isTokenError = msg.includes('unauthorized_client') || msg.includes('invalid_grant');
    console.error('[auth] Failed to get Google clients for user:', isTokenError ? msg : err);
    return {
      success: false,
      status: isTokenError ? 401 : 500,
      message: isTokenError
        ? 'Google credentials expired or revoked. Please log out and log back in at the web app to re-authorize.'
        : 'Failed to initialize Google API clients',
    };
  }

  const user = await getUser(userId);
  const userSettings = user?.settings || {};

  return { success: true, options: { clients, userToken: token, userSettings, userId } };
}
