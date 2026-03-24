/**
 * MCP App: Settings form rendered inside the AI agent's chat via MCP Apps protocol.
 * Uses the official @modelcontextprotocol/ext-apps App class (bundled inline for browser).
 */
import { mcpAppBrowserBundle } from './generated/app-browser-bundle.js';

export function settingsAppHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prompt CV — Settings</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; padding: 16px; color: #1f2937; }
    .card { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 24px; }
    h3 { font-size: 18px; font-weight: 600; margin-bottom: 16px; }
    .field { margin-bottom: 16px; }
    label { display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 4px; }
    input { width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 12px; font-size: 13px; outline: none; font-family: inherit; }
    input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.3); }
    .help { font-size: 11px; color: #9ca3af; margin-top: 4px; }
    .status { min-height: 32px; margin-top: 6px; }
    .valid-card { display: flex; align-items: center; gap: 8px; background: #1f2937; color: #fff; font-size: 12px; border-radius: 6px; padding: 6px 12px; text-decoration: none; transition: background 0.15s; cursor: pointer; }
    .valid-card:hover { background: #374151; }
    .valid-card .check { color: #4ade80; }
    .valid-card .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .valid-card .path { color: #6b7280; flex-shrink: 0; }
    .valid-card .arrow { margin-left: auto; color: #6b7280; flex-shrink: 0; }
    .error-card { background: #7f1d1d; color: #fecaca; font-size: 12px; border-radius: 6px; padding: 6px 12px; }
    .checking-card { display: flex; align-items: center; gap: 8px; background: #1f2937; color: #9ca3af; font-size: 12px; border-radius: 6px; padding: 6px 12px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner { display: inline-block; width: 12px; height: 12px; border: 2px solid #4b5563; border-top-color: #9ca3af; border-radius: 50%; animation: spin 1s linear infinite; }
    .actions { display: flex; align-items: center; gap: 12px; margin-top: 16px; }
    .btn { background: #2563eb; color: #fff; border: none; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; }
    .btn:hover { background: #1d4ed8; }
    .btn:disabled { opacity: 0.5; cursor: default; }
    .msg { font-size: 13px; }
    .msg-ok { color: #16a34a; }
    .msg-err { color: #ef4444; }
    .hidden { display: none; }
    .loading { color: #6b7280; }
  </style>
</head>
<body>
  <div class="card">
    <h3>Settings</h3>
    <div id="loading" class="loading">Loading...</div>
    <div id="form" class="hidden">
      <div class="field">
        <label>Folder path for generated CVs</label>
        <input id="folderPath" type="text" placeholder="cv/generated" />
        <div class="help">Path in Google Drive where generated CVs are saved.</div>
      </div>
      <div class="field">
        <label>Context Doc ID</label>
        <input id="contextDocId" type="text" placeholder="Google Doc ID" />
        <div id="contextDocId-status" class="status"></div>
        <div class="help">A Google Doc with your work history.</div>
      </div>
      <div class="field">
        <label>Instructions Doc ID</label>
        <input id="instructionsDocId" type="text" placeholder="Google Doc ID" />
        <div id="instructionsDocId-status" class="status"></div>
        <div class="help">Leave empty to use default instructions.</div>
      </div>
      <div class="field">
        <label>CV Template Doc ID</label>
        <input id="templateDocId" type="text" placeholder="Google Doc ID" />
        <div id="templateDocId-status" class="status"></div>
        <div class="help">A Google Doc using Handlebars template syntax.</div>
      </div>
      <div class="actions">
        <button id="saveBtn" class="btn" onclick="save()">Save</button>
        <span id="saveMsg" class="msg hidden"></span>
      </div>
    </div>
  </div>

  <!-- Official MCP App SDK (bundled for browser) -->
  <script>${mcpAppBrowserBundle}</script>

  <script>
    // --- Initialize MCP App using official App class ---
    const app = new window.McpApp({ name: 'Prompt CV Settings', version: '1.0.0' });

    // --- Settings Logic ---
    const DOC_ID_RE = /^[a-zA-Z0-9_-]{10,}$/;
    const fields = ['contextDocId', 'instructionsDocId', 'templateDocId'];
    const debounceTimers = {};
    let checkingCount = 0;

    function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

    function renderStatus(field, html) {
      document.getElementById(field + '-status').innerHTML = html;
    }

    function renderValid(field, v) {
      const docId = document.getElementById(field).value;
      const path = v.path ? '<span class="path">' + esc(v.path) + '</span>' : '';
      renderStatus(field,
        '<a href="https://docs.google.com/document/d/' + esc(docId) + '" target="_blank" class="valid-card">' +
        '<span class="check">\\u2713</span>' +
        '<span class="title">' + esc(v.title) + '</span>' +
        path +
        '<span class="arrow">\\u2197</span></a>');
    }

    function renderError(field, msg) {
      renderStatus(field, '<div class="error-card">\\u2717 ' + esc(msg) + '</div>');
    }

    function renderChecking(field) {
      renderStatus(field,
        '<div class="checking-card"><span class="spinner"></span><span>Checking...</span></div>');
    }

    function updateSaveBtn() {
      document.getElementById('saveBtn').disabled = checkingCount > 0;
    }

    async function callTool(name, args) {
      const result = await app.callServerTool({ name, arguments: args });
      const text = result?.content?.find(c => c.type === 'text')?.text;
      return text ? JSON.parse(text) : result;
    }

    async function validateField(field) {
      const value = document.getElementById(field).value.trim();
      if (!value || !DOC_ID_RE.test(value)) { renderStatus(field, ''); return; }
      checkingCount++; updateSaveBtn(); renderChecking(field);
      try {
        const result = await callTool('validate_doc', { documentId: value });
        if (result.valid) renderValid(field, result);
        else renderError(field, result.error || 'Invalid document');
      } catch { renderError(field, 'Validation failed'); }
      checkingCount--; updateSaveBtn();
    }

    function onInput(field) {
      const value = document.getElementById(field).value.trim();
      if (!value) { renderStatus(field, ''); return; }
      renderChecking(field);
      clearTimeout(debounceTimers[field]);
      debounceTimers[field] = setTimeout(() => validateField(field), 800);
    }

    let settingsLoaded = false;
    function loadSettings(settings) {
      if (settingsLoaded) return;
      settingsLoaded = true;
      document.getElementById('folderPath').value = settings.folderPath || '';
      for (const f of fields) {
        const input = document.getElementById(f);
        input.value = settings[f] || '';
        input.addEventListener('input', () => onInput(f));
        if (settings[f]) validateField(f);
      }
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('form').classList.remove('hidden');
    }

    async function save() {
      const btn = document.getElementById('saveBtn');
      const msg = document.getElementById('saveMsg');
      btn.disabled = true; btn.textContent = 'Saving...';
      msg.classList.add('hidden');

      const body = { folderPath: document.getElementById('folderPath').value.trim() };
      for (const f of fields) body[f] = document.getElementById(f).value.trim();

      try {
        const result = await callTool('update_settings', body);
        if (result.error) {
          msg.textContent = result.error; msg.className = 'msg msg-err'; msg.classList.remove('hidden');
          if (result.validation) for (const f of fields)
            if (result.validation[f] && !result.validation[f].valid) renderError(f, result.validation[f].error);
        } else {
          msg.textContent = 'Saved'; msg.className = 'msg msg-ok'; msg.classList.remove('hidden');
          if (result.validation) for (const f of fields)
            if (result.validation[f]) result.validation[f].valid ? renderValid(f, result.validation[f]) : renderError(f, result.validation[f].error);
        }
        setTimeout(() => msg.classList.add('hidden'), 3000);
      } catch { msg.textContent = 'Save failed'; msg.className = 'msg msg-err'; msg.classList.remove('hidden'); }
      btn.disabled = false; btn.textContent = 'Save';
    }

    // --- Connect and handle tool result ---
    app.ontoolresult = (result) => {
      try {
        const text = result?.content?.find(c => c.type === 'text')?.text;
        if (text) loadSettings(JSON.parse(text));
        else loadSettings({});
      } catch { loadSettings({}); }
    };

    app.connect();

    // Safety timeout
    setTimeout(() => { if (!settingsLoaded) loadSettings({}); }, 5000);
  </script>
</body>
</html>`;
}
