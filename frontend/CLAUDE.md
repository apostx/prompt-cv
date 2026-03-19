# Frontend Context

## Structure
```
src/app/
├── app.ts                          # Root component (header + router-outlet)
├── app.config.ts                   # Routes + providers (provideRouter, provideHttpClient)
├── components/
│   ├── login/login.component.ts    # Google OAuth login, missing_scopes error display, public stats
│   ├── auth-callback/              # Handles /auth/callback redirect, stores JWT
│   ├── dashboard/
│   │   ├── dashboard.component.ts  # Layout shell: tab nav (routerLink) + router-outlet
│   │   ├── settings.component.ts   # Settings form with doc ID validation
│   │   ├── files.component.ts      # Generated CVs list (filtered by folder from settings)
│   │   ├── mcp.component.ts        # MCP server URL + connection instructions
│   │   ├── api.component.ts        # REST API docs (endpoints table, curl examples)
│   │   ├── usage.component.ts      # App guide (templates, MCP, getting started)
│   │   ├── security.component.ts   # Google OAuth permissions, disconnect/revoke
│   │   └── admin.component.ts      # Admin-only: user list, CV counts, stats
│   ├── generator/               # Manual CV generation form (templateDocId + JSON data)
│   └── docs-html-writer/           # Direct HTML write to a Google Doc
├── services/
│   ├── auth.service.ts             # JWT storage, user info signal (incl. isAdmin), login/logout
│   ├── user-api.service.ts         # GET/PUT /user/settings, GET /user/files, GET /stats, GET /admin/users
│   ├── cv.service.ts               # POST /cv/generate
│   └── docs.service.ts             # PUT /docs/:id/html
├── guards/
│   ├── auth.guard.ts               # Redirects to /login if no JWT
│   └── guest.guard.ts              # Redirects logged-in users to /settings
└── interceptors/auth.interceptor.ts # Attaches Authorization: Bearer header
```

## Routing
Dashboard is a parent route with child routes. Each tab is a separate component:

| Route | Component | Guard |
|-------|-----------|-------|
| `/login` | LoginComponent | guestGuard |
| `/auth/callback` | AuthCallbackComponent | — |
| `/settings` | SettingsComponent | authGuard |
| `/files` | FilesComponent | authGuard |
| `/mcp` | McpComponent | authGuard |
| `/api` | ApiComponent | authGuard |
| `/usage` | UsageComponent | authGuard |
| `/security` | SecurityComponent | authGuard |
| `/admin` | AdminComponent | authGuard |
| `/` | redirects to `/settings` | — |

## Key Patterns
- **Standalone components** — no NgModules, each component declares its own imports
- **Signals** — Angular signals for reactive state (`signal()`, `.set()`, `()` to read)
- **`inject()` pattern** — use `inject()` function instead of constructor injection
- **Inline templates** — all components use `template:` string, no separate .html files
- **Tailwind CSS** — utility classes, built via `@tailwindcss/cli` before `ng build`
- **Environment files** — `environment.ts` (dev) / `environment.prod.ts` (prod) with `apiUrl` and `authApiUrl`

## Settings Component
The settings form (`settings.component.ts`) handles:
- **Fields:** folderPath, contextDocId (required), instructionsDocId, templateDocId
- **Validation indicators:** green checkmark + title for valid docs, red X + error for invalid
- **Required field indicator:** contextDocId shows orange border when empty (but doesn't block save)
- **Save flow:** validates doc IDs on backend before saving; 400 response shows validation errors
- **Types:** `DocValidation`, `SettingsValidation` interfaces in `user-api.service.ts`

## Build Commands
```bash
npm install              # Install dependencies
npm run build            # Tailwind + ng build (production)
npm run start            # Tailwind + ng serve (development)
npx eslint src/          # Lint
npm test                 # Run tests (vitest)
npm run test:watch       # Watch mode
node scripts/deploy.js   # Upload dist to S3 + invalidate CloudFront
```

## Static Assets
`public/defaults/` contains fallback files served via CloudFront:
- `instructions.txt` — Default CV generation instructions for AI agents
- `schema.txt` — Default JSON schema for CV template data structure
