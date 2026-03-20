# Prompt CV - Project Context

## Overview
AI-powered CV generator with Google Docs Handlebars templates and MCP server for AI agent integration. Multi-user Google OAuth authentication.

## Tech Stack
- **Backend:** AWS Lambda (Node.js 20, TypeScript, ESM), API Gateway
- **Frontend:** Angular 21, Tailwind CSS, standalone components with signals
- **AI Integration:** MCP (Model Context Protocol) on EC2 + CloudFront
- **Auth:** Google OAuth 2.0, JWT (web), opaque tokens (MCP), DynamoDB
- **Integrations:** Google Docs/Drive API, Handlebars templates
- **IaC:** AWS SAM (3 stacks: prod, auth, mcp)

## Project Structure
```
prompt-cv/
├── backend/                        # See backend/CLAUDE.md
│   └── scripts/                   # Deploy scripts (deploy-prod.js, deploy-auth.js, deploy-mcp.js)
├── frontend/                       # See frontend/CLAUDE.md
├── docs/
│   ├── aws-setup.md               # AWS account + deployment guide
│   ├── google-setup.md            # Google Cloud project setup
│   └── user-guide.md              # End-user guide + instruction tips
├── .prettierrc                    # Shared Prettier config
├── CLAUDE.md
├── README.md
├── LICENSE                         # AGPL-3.0
└── .gitignore
```

## AWS Stacks

| Stack | Template | Description |
|-------|----------|-------------|
| `prompt-cv` | `template.yaml` | Prod: CV API Lambda, Frontend S3+CloudFront |
| `prompt-cv-auth` | `template-auth.yaml` | Auth: DynamoDB tables, Auth Lambda, CV Auth Lambda |
| `prompt-cv-mcp` | `template-mcp.yaml` | MCP: EC2 + CloudFront for persistent connections |

## MCP Tools (v2.0.0)

| Tool | Description |
|------|-------------|
| `get_doc_content` | Retrieve plain text of Google Docs (single or batch) |
| `get_cv_instructions` | Start CV session, return instructions + context content + settings |
| `update_cv_data` | Deep-merge data into session (optional finalize) |
| `finalize_cv` | Generate CV from session data + template |
| `optimize_cv` | Fit CV within target pages via margin optimization |

## User Settings
Each user can configure:
- `folderPath` — Google Drive folder for generated CVs (default: `cv/generated`)
- `contextDocId` — Work experience document (optional, content returned inline by `get_cv_instructions`)
- `instructionsDocId` — Custom AI instructions (falls back to default)
- `templateDocId` — Handlebars CV template (falls back to default)

Settings are validated against Google Docs API before saving (404/403 checks). Empty fields use default fallbacks.

## User Record
Each user record in DynamoDB (`prompt-cv-users`) includes:
- `userId`, `email`, `name` — Google account info
- `googleAccessToken`, `googleRefreshToken`, `googleTokenExpiry` — OAuth credentials
- `settings` — user preferences (see above)
- `isAdmin?: boolean` — admin flag (grants access to admin endpoints)
- `cvsGenerated?: number` — atomic counter incremented on each CV generation

## API Endpoints

### Auth API (`template-auth.yaml` → AuthFunction)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/auth/google` | — | Initiate Google OAuth web flow |
| GET | `/auth/google/callback` | — | OAuth callback, issues JWT |
| GET | `/stats` | — | Public stats (user count, total CVs) with 5-min cache |
| POST | `/auth/revoke` | JWT | Revoke Google tokens + clear from DB |

### CV Auth API (`template-auth.yaml` → CvAuthFunction)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/cv/generate` | JWT | Generate CV (increments CV counter) |
| GET | `/user/settings` | JWT | Get user settings |
| PUT | `/user/settings` | JWT | Update user settings (validates doc IDs) |
| GET | `/user/files` | JWT | List generated CV files |
| GET | `/admin/users` | JWT + admin | List all users with stats |

## Commands
```bash
# Backend
cd backend && npx tsc --noEmit        # Type check
cd backend && npx eslint src/          # Lint
cd backend && npm test                 # Run tests (vitest)
cd backend && npm run test:watch       # Watch mode
cd backend && node scripts/deploy-prod.js  # Deploy prod stack + upload Lambda code
cd backend && node scripts/deploy-auth.js  # Deploy auth stack + upload Lambda code
cd backend && npm run build:mcp        # Bundle MCP server
cd backend && npm run deploy:mcp       # Build + upload + restart EC2

# Frontend
cd frontend && npm run build           # Tailwind + ng build
cd frontend && npx eslint src/         # Lint
cd frontend && npm test                # Run tests (vitest)
cd frontend && node scripts/deploy.js  # Discover URLs, build, upload to S3, invalidate CloudFront
```

## Frontend Routes
| Route | Component | Guard | Description |
|-------|-----------|-------|-------------|
| `/login` | LoginComponent | guestGuard | Google OAuth login + public stats |
| `/auth/callback` | AuthCallbackComponent | — | OAuth redirect handler |
| `/settings` | SettingsComponent | authGuard | User settings (folder, doc IDs with validation) |
| `/files` | FilesComponent | authGuard | Generated CV list (filtered by folder) |
| `/mcp` | McpComponent | authGuard | MCP server URL + connect instructions |
| `/api` | ApiComponent | authGuard | REST API documentation |
| `/usage` | UsageComponent | authGuard | Application usage guide |
| `/security` | SecurityComponent | authGuard | Google OAuth permissions + disconnect |
| `/admin` | AdminComponent | authGuard | Admin-only user management + stats |

## Configuration
- Google OAuth credentials: SAM parameters (GoogleClientId, GoogleClientSecret)
- Per-user auth: DynamoDB (users, oauth-clients, oauth-codes, oauth-tokens)
- `env.json` (gitignored) for `sam local` development
- Default instructions/schema: `frontend/public/defaults/` (deployed to S3, MCP fallback)
- CORS origins: `CORS_ORIGINS` env var in SAM templates (defaults to `*` for dev)

## Code Conventions
- LF line endings
- ESM modules, strict TypeScript
- Zod schemas for API input validation (`backend/src/shared/validation.ts`)
- Typed error handling with `ApiError` class (`backend/src/shared/errors.ts`)
- Shared utilities in `backend/src/shared/` (cors, response, validation, errors)
- Angular: standalone components, signals, `inject()` pattern, Tailwind utility classes
- Inline templates for all components (no separate .html files)
- ESLint + Prettier configured for both backend and frontend
- **Version bumps per commit** — bump `version` in the relevant `package.json` (backend, frontend) when that part is touched. Also bump the MCP server version in `backend/src/mcp/server.ts` if MCP tools changed. Use semver: patch for fixes, minor for features, major for breaking changes.
- **Conventional Commits** — use `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `style:`, `perf:`, `test:` prefixes. Scope is optional (e.g., `feat(auth):`, `fix(frontend):`). Keep subject concise, imperative mood.
