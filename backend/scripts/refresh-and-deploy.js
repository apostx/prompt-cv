import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { getRefreshToken } from './get-refresh-token.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, '..');
const ENV_JSON_PATH = path.join(BACKEND_DIR, 'env.json');

// Step 1: Read credentials from env.json
if (!fs.existsSync(ENV_JSON_PATH)) {
  console.error('env.json not found at', ENV_JSON_PATH);
  process.exit(1);
}

const envJson = JSON.parse(fs.readFileSync(ENV_JSON_PATH, 'utf8'));

// Find client ID and secret from the first function that has them
let clientId, clientSecret;
for (const fnConfig of Object.values(envJson)) {
  if (fnConfig.GOOGLE_CLIENT_ID && fnConfig.GOOGLE_CLIENT_SECRET) {
    clientId = fnConfig.GOOGLE_CLIENT_ID;
    clientSecret = fnConfig.GOOGLE_CLIENT_SECRET;
    break;
  }
}

if (!clientId || !clientSecret) {
  console.error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET not found in env.json');
  process.exit(1);
}

// Step 2: Get new refresh token via browser OAuth flow
console.log('Starting OAuth flow to get new refresh token...');
console.log(`Using client: ${clientId.substring(0, 20)}...`);

const refreshToken = await getRefreshToken(clientId, clientSecret);
console.log('Got new refresh token.');

// Step 3: Update env.json - all function entries that have GOOGLE_REFRESH_TOKEN
let updated = 0;
for (const [fnName, fnConfig] of Object.entries(envJson)) {
  if (fnConfig.GOOGLE_REFRESH_TOKEN !== undefined) {
    fnConfig.GOOGLE_REFRESH_TOKEN = refreshToken;
    updated++;
    console.log(`  Updated ${fnName}`);
  }
}

fs.writeFileSync(ENV_JSON_PATH, JSON.stringify(envJson, null, 2) + '\n');
console.log(`env.json updated (${updated} functions).`);

// Step 4: Deploy if --deploy flag is passed
if (process.argv.includes('--deploy')) {
  console.log('\nBuilding and deploying...');
  // Collect doc IDs from McpApiFunction config
  const mcpConfig = envJson.McpApiFunction || {};
  const cvDocId = mcpConfig.CV_DOC_ID || '';
  const contextDocId = mcpConfig.CONTEXT_DOC_ID || '';

  const overrides = [
    `GoogleClientId='${clientId}'`,
    `GoogleClientSecret='${clientSecret}'`,
    `GoogleRefreshToken='${refreshToken}'`,
    `CvDocId='${cvDocId}'`,
    `ContextDocId='${contextDocId}'`,
  ].join(' ');

  const deployCmd = `cd '${BACKEND_DIR}'; sam build; sam deploy --parameter-overrides ${overrides}`;
  execSync(`powershell.exe -Command "${deployCmd}"`, { stdio: 'inherit' });
  console.log('Deploy complete.');
} else {
  console.log('\nToken refreshed. To also deploy, run: npm run token:deploy');
}
