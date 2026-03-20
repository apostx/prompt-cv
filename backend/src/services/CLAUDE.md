# Services Context

## Files

### google-docs.ts
Google Docs/Drive API wrapper with 20+ functions. Core pattern: `getClients(clients?)` returns either user-specific clients or default shared clients (from env var refresh token).

Key functions:
- `exportDocumentAsHtml(docId, clients?)` — export doc as HTML
- `getDocumentTitle(docId, clients?)` — lightweight doc validation (title only)
- `createDocumentFromHtml(name, html, folderId, clients?)` — create doc via Drive HTML import
- `updateDocumentFromHtml(docId, html, clients?)` — replace doc content via Drive HTML import
- `applyParagraphIndentation(docId, indents, clients?)` — fix indentation lost in HTML import
- `findOrCreateFolder(name, parentId, clients?)` — find or create Drive folder
- `findFolderByPath(path, clients?)` — navigate nested folder path
- `findFileByName(name, folderId, clients?)` — find doc by name in folder
- `getPageCount(docId, clients?)` — count pages via Docs API
- `setDocumentMargins(docId, margin, clients?)` — set page margins
- `removePageBreaks(docId, clients?)` — strip manual page breaks

### cv-generation.ts
Shared CV generation logic extracted from handlers. Both `cv-api.ts` and `cv-api-auth.ts` call `generateCv()`.

Exports:
- `generateCv(options)` — full pipeline: template → clean → render → auto-link → create/update doc → fix indentation
- `cleanHandlebarsHtml(html)` — strip HTML tags from inside `{{...}}` and remove `<p>` wrappers around block helpers
- `autoLinkText(html)` — convert plain emails and URLs to `<a>` tags (skips existing links)
- `extractParagraphIndents(html)` — extract margin-left/text-indent from `<p>` tags
- `toSnakeCase(str)` — convert space-separated string to snake_case
- `buildFilename(data)` — derive filename from header.name + application.position + application.company

### cv-optimizer.ts
Binary search margin optimization. Reduces margins from 1.0" down to 0.8" (configurable) to fit document within target page count. Also removes manual page breaks before optimizing.

### auth.ts
Google OAuth helpers:
- `getGoogleAuthUrl(redirectUri, state, scopes)` — build OAuth consent URL
- `exchangeCodeForTokens(code, redirectUri)` — exchange auth code for tokens
- `refreshGoogleToken(refreshToken)` — refresh expired access token
- `signJwt(payload)` / `verifyJwt(token)` — JWT sign/verify using jose library (payload includes optional `isAdmin`)
- `verifyScopes(grantedScopes)` — check granted OAuth scopes match required scopes (only `drive.file` is required; `drive.readonly` is optional)
- `revokeGoogleToken(token)` — revoke Google refresh token via Google's revocation endpoint

### user-store.ts
DynamoDB CRUD for users. `User` interface includes `isAdmin?: boolean` and `cvsGenerated?: number`.
- `saveUser(user)` — create/update user record (PutCommand — caller must spread existing record to preserve fields)
- `getUser(userId)` — get user by ID
- `updateUserSettings(userId, settings)` — merge new settings into existing (filter undefined, shallow merge)
- `getGoogleClientsForUser(userId)` — create authenticated Google API clients with automatic token refresh
- `incrementCvCount(userId)` — atomic increment of `cvsGenerated` via DynamoDB ADD
- `getPublicStats()` — scan users table, return `{ userCount, totalCvsGenerated }`
- `getAllUsersAdmin()` — scan for admin listing (email, name, cvsGenerated, createdAt)

### oauth-store.ts
DynamoDB OAuth lifecycle for MCP clients:
- `registerClient(clientName, redirectUri)` — register OAuth client
- `saveAuthCode(code, clientId, userId, redirectUri)` — store auth code (10 min TTL)
- `consumeAuthCode(code)` — exchange and delete auth code
- `saveAccessToken(token, userId, clientId)` — store opaque token (7 day TTL)
- `getUserByAccessToken(token)` — resolve token to userId
