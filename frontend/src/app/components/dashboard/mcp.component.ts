import { Component, inject, signal, OnInit } from '@angular/core';
import { UserApiService } from '../../services/user-api.service';

@Component({
  selector: 'app-mcp',
  standalone: true,
  template: `
    <div class="bg-white rounded-lg shadow-sm p-6">
      <h3 class="text-lg font-semibold text-gray-800 mb-4">MCP Server</h3>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Server URL</label>
          <div class="flex gap-2">
            <input
              type="text"
              [value]="mcpUrl()"
              readonly
              class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50"
            />
            <button
              (click)="copyToClipboard()"
              [disabled]="!mcpUrl()"
              class="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ copied() ? 'Copied!' : 'Copy' }}
            </button>
          </div>
        </div>
        <div class="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
          <p class="font-medium mb-2">How to connect:</p>
          <ol class="list-decimal list-inside space-y-1">
            <li>In Claude, go to Settings and add a new MCP connector</li>
            <li>Paste the Server URL above</li>
            <li>You'll be prompted to sign in with your Google account</li>
            <li>Grant access to Google Drive so Prompt CV can save CVs</li>
          </ol>
        </div>
      </div>
    </div>
  `,
})
export class McpComponent implements OnInit {
  private userApi = inject(UserApiService);

  mcpUrl = signal('');
  copied = signal(false);

  ngOnInit() {
    this.userApi.getConfig().subscribe({
      next: (config) => this.mcpUrl.set(config.mcpUrl),
      error: () => this.mcpUrl.set('Failed to load MCP URL'),
    });
  }

  copyToClipboard() {
    navigator.clipboard.writeText(this.mcpUrl());
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }
}
