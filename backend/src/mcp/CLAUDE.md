# MCP Server Context

## Architecture
Fully stateless Express server running on EC2 behind CloudFront, providing MCP (Model Context Protocol) over Streamable HTTP transport. Every POST request authenticates independently — no in-memory sessions, no SSE streaming.

## Files
- `index.ts` — Express server, per-request auth (Bearer token → userId), ephemeral transport+server per request
- `server.ts` — MCP tool definitions (`createServer()`), 6 tools for CV generation workflow
- `session-store.ts` — DynamoDB-backed CV data sessions (UUID keyed, userId-scoped, 1h TTL, deep merge, max 20 per user)

## Request Lifecycle
1. Client sends POST `/mcp` with Bearer token (every request, not just initialize)
2. Server validates token (opaque access token → userId lookup)
3. Creates ephemeral `StreamableHTTPServerTransport` + `McpServer` with user's Google API clients, settings, and userId
4. Handles request, returns JSON response
5. Closes transport and server

No persistent transport sessions. No SSE. No session ID tracking. CV data sessions (DynamoDB) are the only stateful element.

## CV Data Sessions (DynamoDB)
- Scoped to userId — ownership verified on every get/update/delete
- Max 20 active sessions per user (enforced on create)
- 1h TTL via DynamoDB TTL attribute
- Cleaned up automatically after successful CV generation (finalize)
- Can be manually cleaned up via `reset_sessions` tool

## Tools

### `get_doc_content`
Retrieves plain text of one or more Google Docs. Accepts single `documentId` or array of `documentIds`.

### `get_cv_instructions`
Starts a CV session. Returns:
- `sessionId` — for `update_cv_data` and `finalize_cv`
- `prompt` — instructions text (from user doc, env var, or default)
- `context` — context doc content (if `contextDocId` configured; fetched inline, no separate call needed)
- `settings` — `{ contextDocId, templateDocId }` (if configured)
- `warnings` — only warns about missing `templateDocId` (required for finalization); `contextDocId` is optional

Fallback chain for instructions: user's `instructionsDocId` → `INSTRUCTIONS_DOC_ID` env var → `FRONTEND_URL/defaults/instructions.txt`

### `update_cv_data`
Deep-merges data into the session store. Can optionally `finalize: true` to trigger generation in the same call. Deletes session data after successful finalization.

### `finalize_cv`
Generates CV from session data + template. Deletes session data after successful generation.

### `optimize_cv`
Binary search margin optimization to fit document within target page count.

### `reset_sessions`
Deletes all active CV sessions for the current user. Use when stuck or to clean up before starting fresh.

## Auth
Token validated on every request (stateless). userId passed to `createServer()` for session ownership validation in all tool calls.
