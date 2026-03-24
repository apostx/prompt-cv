# Backend Context

## Structure
```
src/
├── handlers/
│   ├── cv-api.ts           # Prod stack Lambda — shared service account, no auth
│   ├── cv-api-auth.ts      # Auth stack Lambda — per-user Google credentials, admin endpoints
│   └── auth-api.ts         # Auth stack Lambda — OAuth flows (web + MCP), revoke, stats
├── mcp/                    # See src/mcp/CLAUDE.md
│   ├── index.ts            # Stateless Express server (EC2), per-request auth, OAuth discovery
│   ├── server.ts           # MCP tool definitions (6 tools), createServer()
│   └── session-store.ts    # DynamoDB CV data sessions (UUID keyed, userId-scoped, 1h TTL, max 20/user)
├── services/               # See src/services/CLAUDE.md
│   ├── google-docs.ts      # Google Docs/Drive API wrapper (20+ functions)
│   ├── cv-generation.ts     # Shared CV generation logic (template → doc)
│   ├── cv-optimizer.ts     # Binary search margin optimization (0.8"–1.0")
│   ├── auth.ts             # Google OAuth helpers, JWT sign/verify, scope verification, token revocation
│   ├── user-store.ts       # DynamoDB user CRUD, Google client factory, stats, admin queries
│   └── oauth-store.ts      # DynamoDB OAuth: client registration, auth codes, access tokens
├── shared/
│   ├── cors.ts             # Dynamic CORS headers (CORS_ORIGINS env var) + OPTIONS response
│   ├── response.ts         # JSON response helper with CORS
│   ├── validation.ts       # Zod schemas for all API inputs
│   └── errors.ts           # ApiError class + handleError() for consistent error responses
└── types/index.ts          # Request/response type definitions
```

## SAM Templates
- `template.yaml` — Prod stack: CV API Lambda + Frontend S3/CloudFront
- `template-auth.yaml` — Auth stack: 4 DynamoDB tables + Auth Lambda + CV Auth Lambda
- `template-mcp.yaml` — MCP stack: EC2 t3.micro + CloudFront + IAM + Elastic IP + Sessions DynamoDB table

## Key Patterns

### Dual Auth Strategy
- **Web (JWT):** `auth-api.ts` issues JWT on Google OAuth callback, frontend sends as Bearer token
- **MCP (opaque tokens):** `auth-api.ts` issues opaque tokens via OAuth 2.0 flow, stored in DynamoDB with 30-min TTL (no application-level expiry — token valid as long as DynamoDB item exists)

### CV Generation Flow (cv-generation.ts)
Both `cv-api.ts` and `cv-api-auth.ts` delegate to the shared `generateCv()` service:
1. Export Google Docs template as HTML (`exportDocumentAsHtml`)
2. Clean Handlebars artifacts from HTML (`cleanHandlebarsHtml`)
3. Compile Handlebars template with user data
4. Auto-link emails and URLs (`autoLinkText`)
5. Build filename from data (snake_case of name + position + company)
6. Find/create folder → find existing file or create new doc
7. Re-apply paragraph indentation (lost in HTML import)

### Input Validation (validation.ts)
All API handlers validate request bodies with Zod schemas before processing:
- `cvGenerateRequestSchema` — templateDocId + data
- `optimizeRequestSchema` — documentId + optional params
- `docUpdateRequestSchema` — content string
- `userSettingsSchema` — optional doc IDs + folder path
- `googleDocIdSchema` — reusable schema for Google Doc ID format

### Settings Validation
`handleUpdateSettings` validates doc IDs against Google Docs API before saving:
- Empty fields are allowed (use default fallbacks)
- Non-empty fields must be accessible (404/403 checks via `getDocumentTitle`)
- Returns validation results with document titles on success

### MCP Instructions Fallback
`get_cv_instructions` checks in order:
1. User's `instructionsDocId` setting
2. `INSTRUCTIONS_DOC_ID` env var
3. Default instructions from `FRONTEND_URL/defaults/instructions.txt`

Returns `settings` (contextDocId, templateDocId) and `warnings` array if settings are missing.

### CORS
`cors.ts` supports dynamic origin checking via `CORS_ORIGINS` env var (comma-separated). Falls back to `*` if not set. SAM templates pass `FrontendUrl` as the allowed origin.

### Error Handling
`errors.ts` provides `ApiError` class for typed errors and `handleError()` for consistent error responses in catch blocks. Replaces ad-hoc error handling in all Lambda handlers.

## Deploy Scripts
SAM CLI on Windows has an esbuild artifact upload bug (empty `manifest_hash`). Deploy scripts work around this by running `sam deploy` for CloudFormation, then directly uploading Lambda code via `aws lambda update-function-code`.

- `scripts/deploy-prod.js` — Deploy prod stack + upload CvApiFunction Lambda
- `scripts/deploy-auth.js` — Deploy auth stack + upload AuthFunction + CvAuthFunction Lambdas
- `scripts/deploy-mcp.js` — Build MCP bundle, upload to S3, restart EC2 via SSM

## Build Commands
```bash
npm install                        # Install dependencies
npx tsc --noEmit                   # Type check
npx eslint src/                    # Lint
npm test                           # Run tests (vitest)
npm run test:watch                 # Watch mode
node scripts/deploy-prod.js        # Deploy prod stack + Lambda code
node scripts/deploy-auth.js        # Deploy auth stack + Lambda code
npm run build:mcp                  # Bundle MCP server (esbuild → dist/mcp-server.mjs)
npm run deploy:mcp                 # Build + upload + restart EC2
```
