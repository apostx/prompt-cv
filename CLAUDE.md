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
├── frontend/                       # See frontend/CLAUDE.md
├── docs/
│   ├── aws-setup.md               # AWS account + deployment guide
│   ├── google-setup.md            # Google Cloud project setup
│   └── user-guide.md              # End-user guide + instruction tips
├── .github/workflows/deploy.yml   # CI/CD (GitHub Actions)
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
| `get_cv_instructions` | Start CV session, return instructions + settings + warnings |
| `update_cv_data` | Deep-merge data into session (optional finalize) |
| `finalize_cv` | Generate CV from session data + template |
| `optimize_cv` | Fit CV within target pages via margin optimization |

## User Settings
Each user can configure:
- `folderPath` — Google Drive folder for generated CVs (default: `cv/generated`)
- `contextDocId` — Work experience document (required for CV generation)
- `instructionsDocId` — Custom AI instructions (falls back to default)
- `templateDocId` — Handlebars CV template (falls back to default)

Settings are validated against Google Docs API before saving (404/403 checks). Empty fields use default fallbacks.

## Commands
```bash
# Backend
cd backend && npx tsc --noEmit      # Type check
cd backend && npx eslint src/        # Lint
cd backend && sam build && sam deploy # Build & deploy prod stack
cd backend && sam build -t template-auth.yaml && sam deploy --config-file samconfig-auth.toml
cd backend && npm run build:mcp      # Bundle MCP server
cd backend && npm run deploy:mcp     # Build + upload + restart EC2

# Frontend
cd frontend && npm run build         # Tailwind + ng build
cd frontend && npx eslint src/       # Lint
cd frontend && node scripts/deploy.js # Discover URLs, build, upload to S3, invalidate CloudFront
```

## Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| `/login` | LoginComponent | Google OAuth login |
| `/auth/callback` | AuthCallbackComponent | OAuth redirect handler |
| `/settings` | SettingsComponent | User settings (folder, doc IDs with validation) |
| `/files` | FilesComponent | Generated CV list (filtered by folder) |
| `/mcp` | McpComponent | MCP server URL + connect instructions |
| `/api` | ApiComponent | REST API documentation |
| `/usage` | UsageComponent | Application usage guide |

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
