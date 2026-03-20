# MCP Server Context

## Architecture
Express server running on EC2 behind CloudFront, providing MCP (Model Context Protocol) over Streamable HTTP transport.

## Files
- `index.ts` — Express server, session lifecycle (30 min idle timeout), OAuth token validation on initialize, keepalive SSE pings (10s interval for ChatGPT compatibility)
- `server.ts` — MCP tool definitions (`createServer()`), 5 tools for CV generation workflow
- `session-store.ts` — DynamoDB-backed CV data sessions (UUID keyed, 1h TTL, deep merge updates)

## Session Lifecycle
1. Client sends `initialize` request with Bearer token
2. Server validates token (opaque access token → userId lookup)
3. Creates `McpServer` instance with user's Google API clients and settings
4. Returns session ID in `Mcp-Session-Id` header
5. Subsequent requests include session ID header
6. Sessions expire after 30 min idle, cleaned up every 5 min

## Tools

### `get_cv_instructions`
Starts a CV session. Returns:
- `sessionId` — for `update_cv_data` and `finalize_cv`
- `prompt` — instructions text (from user doc, env var, or default)
- `context` — context doc content (if `contextDocId` configured; fetched inline, no separate call needed)
- `settings` — `{ contextDocId, templateDocId }` (if configured)
- `warnings` — only warns about missing `templateDocId` (required for finalization); `contextDocId` is optional

Fallback chain for instructions: user's `instructionsDocId` → `INSTRUCTIONS_DOC_ID` env var → `FRONTEND_URL/defaults/instructions.txt`

### `get_doc_content`
Retrieves plain text of one or more Google Docs. Accepts single `documentId` or array of `documentIds`.

### `update_cv_data`
Deep-merges data into the session store. Can optionally `finalize: true` to trigger generation in the same call.

### `finalize_cv`
Generates CV from session data using `generateCv()`. Requires `templateDocId` (from session data or user settings).

### `optimize_cv`
Binary search margin optimization to fit document within target page count.

## Auth
Token validated only on `initialize` request. User settings are passed to `createServer()` so tools can access them without re-authenticating.
