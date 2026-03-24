export function settingsPage(authApiUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prompt CV — Settings</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @keyframes spin { to { transform: rotate(360deg); } }
    .animate-spin { animation: spin 1s linear infinite; }
  </style>
</head>
<body class="bg-gray-50 min-h-screen flex items-start justify-center p-6">
  <div class="w-full max-w-xl" id="app">
    <div class="bg-white rounded-lg shadow-sm p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-gray-800">Settings</h3>
        <a href="https://promptcv.sallai.cc/settings" target="_blank" class="text-xs text-blue-600 hover:text-blue-800">Open full app ↗</a>
      </div>

      <div id="loading" class="text-gray-500">Loading...</div>
      <div id="error" class="text-sm text-red-500 hidden">Failed to load settings. Check your authentication.</div>

      <div id="form" class="space-y-4 hidden">
        <!-- Folder path -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Folder path for generated CVs</label>
          <input id="folderPath" type="text" placeholder="cv/generated"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <p class="text-xs text-gray-400 mt-1">Path in Google Drive where generated CVs are saved.</p>
        </div>

        <!-- Context Doc ID -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Context Doc ID</label>
          <input id="contextDocId" type="text" placeholder="Google Doc ID"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div id="contextDocId-status" class="min-h-8 mt-1.5"></div>
          <p class="text-xs text-gray-400">A Google Doc with your work history.</p>
        </div>

        <!-- Instructions Doc ID -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Instructions Doc ID</label>
          <input id="instructionsDocId" type="text" placeholder="Google Doc ID"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div id="instructionsDocId-status" class="min-h-8 mt-1.5"></div>
          <p class="text-xs text-gray-400">Leave empty to use default instructions.</p>
        </div>

        <!-- Template Doc ID -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">CV Template Doc ID</label>
          <input id="templateDocId" type="text" placeholder="Google Doc ID"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div id="templateDocId-status" class="min-h-8 mt-1.5"></div>
          <p class="text-xs text-gray-400">A Google Doc using Handlebars template syntax.</p>
        </div>

        <!-- Save -->
        <div class="flex items-center gap-3">
          <button id="saveBtn" onclick="save()"
            class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 cursor-pointer">
            Save
          </button>
          <span id="saveMsg" class="text-sm hidden"></span>
        </div>
      </div>
    </div>
  </div>

  <script>
    const API = '${authApiUrl}';
    const DOC_ID_RE = /^[a-zA-Z0-9_-]{10,}$/;
    const fields = ['contextDocId', 'instructionsDocId', 'templateDocId'];
    const debounceTimers = {};
    let token = '';
    let checking = {};

    function getToken() {
      const params = new URLSearchParams(window.location.search);
      return params.get('token') || '';
    }

    function headers() {
      return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
    }

    function renderStatus(field, html) {
      document.getElementById(field + '-status').innerHTML = html;
    }

    function renderValid(field, v) {
      const docId = document.getElementById(field).value;
      const path = v.path ? '<span class="text-gray-500 shrink-0">' + esc(v.path) + '</span>' : '';
      renderStatus(field,
        '<a href="https://docs.google.com/document/d/' + esc(docId) + '" target="_blank"' +
        ' class="bg-gray-800 hover:bg-gray-700 text-white text-xs rounded-md px-3 py-1.5 flex items-center gap-2 no-underline cursor-pointer transition-colors">' +
        '<span class="text-green-400">✓</span>' +
        '<span class="truncate">' + esc(v.title) + '</span>' +
        path +
        '<span class="ml-auto text-gray-500 shrink-0">↗</span></a>');
    }

    function renderError(field, msg) {
      renderStatus(field,
        '<div class="bg-red-900 text-red-200 text-xs rounded-md px-3 py-1.5">✗ ' + esc(msg) + '</div>');
    }

    function renderChecking(field) {
      renderStatus(field,
        '<div class="bg-gray-800 text-gray-400 text-xs rounded-md px-3 py-1.5 flex items-center gap-2">' +
        '<span class="inline-block w-3 h-3 border-2 border-gray-600 border-t-gray-400 rounded-full animate-spin"></span>' +
        '<span>Checking...</span></div>');
    }

    function esc(s) {
      const d = document.createElement('div');
      d.textContent = s || '';
      return d.innerHTML;
    }

    function updateSaveBtn() {
      const btn = document.getElementById('saveBtn');
      btn.disabled = Object.values(checking).some(Boolean);
    }

    async function validateField(field) {
      const value = document.getElementById(field).value.trim();
      if (!value || !DOC_ID_RE.test(value)) {
        renderStatus(field, '');
        checking[field] = false;
        updateSaveBtn();
        return;
      }
      checking[field] = true;
      updateSaveBtn();
      renderChecking(field);
      try {
        const res = await fetch(API + '/user/validate-doc?id=' + encodeURIComponent(value), { headers: headers() });
        const data = await res.json();
        if (data.valid) {
          renderValid(field, data);
        } else {
          renderError(field, data.error || 'Invalid document');
        }
      } catch {
        renderError(field, 'Validation failed');
      }
      checking[field] = false;
      updateSaveBtn();
    }

    function onInput(field) {
      const value = document.getElementById(field).value.trim();
      if (!value) {
        renderStatus(field, '');
        checking[field] = false;
        updateSaveBtn();
        return;
      }
      checking[field] = true;
      updateSaveBtn();
      renderChecking(field);
      clearTimeout(debounceTimers[field]);
      debounceTimers[field] = setTimeout(() => validateField(field), 800);
    }

    async function load() {
      token = getToken();
      if (!token) {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('error').textContent = 'Missing token. Open this page from your MCP client.';
        document.getElementById('error').classList.remove('hidden');
        return;
      }
      try {
        const res = await fetch(API + '/user/settings', { headers: headers() });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const s = data.settings || {};
        document.getElementById('folderPath').value = s.folderPath || '';
        for (const f of fields) {
          const input = document.getElementById(f);
          input.value = s[f] || '';
          input.addEventListener('input', () => onInput(f));
          if (s[f]) validateField(f);
        }
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('form').classList.remove('hidden');
      } catch {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('error').classList.remove('hidden');
      }
    }

    async function save() {
      const btn = document.getElementById('saveBtn');
      const msg = document.getElementById('saveMsg');
      btn.disabled = true;
      btn.textContent = 'Saving...';
      msg.classList.add('hidden');

      const body = { folderPath: document.getElementById('folderPath').value.trim() };
      for (const f of fields) {
        body[f] = document.getElementById(f).value.trim();
      }

      try {
        const res = await fetch(API + '/user/settings', {
          method: 'PUT',
          headers: headers(),
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (res.ok) {
          msg.textContent = 'Saved';
          msg.className = 'text-sm text-green-600';
          msg.classList.remove('hidden');
          if (data.validation) {
            for (const f of fields) {
              if (data.validation[f]) {
                if (data.validation[f].valid) renderValid(f, data.validation[f]);
                else renderError(f, data.validation[f].error);
              }
            }
          }
          setTimeout(() => msg.classList.add('hidden'), 3000);
        } else {
          msg.textContent = data.error || 'Save failed';
          msg.className = 'text-sm text-red-500';
          msg.classList.remove('hidden');
          if (data.validation) {
            for (const f of fields) {
              if (data.validation[f] && !data.validation[f].valid) {
                renderError(f, data.validation[f].error);
              }
            }
          }
          setTimeout(() => msg.classList.add('hidden'), 5000);
        }
      } catch {
        msg.textContent = 'Network error';
        msg.className = 'text-sm text-red-500';
        msg.classList.remove('hidden');
      }
      btn.disabled = false;
      btn.textContent = 'Save';
    }

    load();
  </script>
</body>
</html>`;
}
