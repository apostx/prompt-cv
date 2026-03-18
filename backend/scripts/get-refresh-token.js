import { google } from 'googleapis';
import http from 'http';
import open from 'open';
import { URL } from 'url';

const REDIRECT_URI = 'http://localhost:3000/oauth2callback';
const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive',
];

/**
 * Run the OAuth2 flow via localhost redirect.
 * Opens browser, captures auth code, exchanges for refresh token.
 * @returns {Promise<string>} The refresh token
 */
export function getRefreshToken(clientId, clientSecret) {
  return new Promise((resolve, reject) => {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost:3000');

      if (url.pathname === '/oauth2callback') {
        const code = url.searchParams.get('code');

        if (code) {
          try {
            const { tokens } = await oauth2Client.getToken(code);

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h1>Success!</h1><p>You can close this window.</p>');

            server.close();
            resolve(tokens.refresh_token);
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<h1>Error</h1><p>' + error.message + '</p>');
            server.close();
            reject(error);
          }
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>Error</h1><p>No authorization code received</p>');
        }
      }
    });

    server.listen(3000, () => {
      console.log('Opening browser for authorization...');
      console.log('If browser does not open, visit this URL:');
      console.log(authUrl);
      open(authUrl);
    });
  });
}

// CLI entry point: run directly with env vars
const isMainModule = !process.argv[1] || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;
if (isMainModule && process.argv[1]?.includes('get-refresh-token')) {
  const clientId = process.env.GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || 'YOUR_CLIENT_SECRET';

  console.log('Starting OAuth flow...');
  const token = await getRefreshToken(clientId, clientSecret);
  console.log('\n========================================');
  console.log('REFRESH TOKEN:');
  console.log('========================================');
  console.log(token);
  console.log('========================================\n');
  process.exit(0);
}
