import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { UserApiService } from '../../services/user-api.service';

@Component({
  selector: 'app-login',
  standalone: true,
  template: `
    <div class="min-h-screen flex">
      <!-- Dark left panel — hidden on mobile -->
      <div class="hidden md:flex w-1/2 bg-gray-900 text-white flex-col justify-center p-12">
        <h1 class="text-3xl font-bold mb-3">Prompt CV</h1>
        <p class="text-gray-400 text-lg mb-8">Generate professional CVs with any AI client via MCP.</p>

        <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">How to use</h2>
        <div class="space-y-5 text-sm">
          <div>
            <p class="text-gray-300"><span class="text-white font-semibold">1.</span> Add this MCP URL as a Connector in Claude Desktop</p>
            <p class="text-gray-500 text-xs mt-0.5">(works with ChatGPT and other MCP-compatible clients)</p>
          </div>
          <div>
            <p class="text-gray-300"><span class="text-white font-semibold">2.</span> Click Connect &mdash; sign in with Google</p>
          </div>
          <div>
            <p class="text-gray-300 mb-1.5"><span class="text-white font-semibold">3.</span> Add your work history</p>
            <div class="relative bg-gray-800 border border-gray-700 rounded px-3 py-2 pr-14 font-mono text-xs text-gray-300 leading-relaxed">
              {{ promptStep3() }}
              <button (click)="copyPrompt('step3')" class="absolute top-1.5 right-1.5 px-2 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-400 rounded cursor-pointer">{{ copiedPrompt() === 'step3' ? 'Copied!' : 'Copy' }}</button>
            </div>
          </div>
          <div>
            <p class="text-gray-300 mb-1.5"><span class="text-white font-semibold">4.</span> Generate a CV</p>
            <div class="relative bg-gray-800 border border-gray-700 rounded px-3 py-2 pr-14 font-mono text-xs text-gray-300 leading-relaxed">
              {{ promptStep4() }}
              <button (click)="copyPrompt('step4')" class="absolute top-1.5 right-1.5 px-2 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-400 rounded cursor-pointer">{{ copiedPrompt() === 'step4' ? 'Copied!' : 'Copy' }}</button>
            </div>
          </div>
          <div>
            <p class="text-gray-300 mb-1.5"><span class="text-white font-semibold">5.</span> Improve future results</p>
            <div class="relative bg-gray-800 border border-gray-700 rounded px-3 py-2 pr-14 font-mono text-xs text-gray-300 leading-relaxed mb-2">
              {{ promptStep5a() }}
              <button (click)="copyPrompt('step5a')" class="absolute top-1.5 right-1.5 px-2 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-400 rounded cursor-pointer">{{ copiedPrompt() === 'step5a' ? 'Copied!' : 'Copy' }}</button>
            </div>
            <div class="relative bg-gray-800 border border-gray-700 rounded px-3 py-2 pr-14 font-mono text-xs text-gray-300 leading-relaxed">
              {{ promptStep5b() }}
              <button (click)="copyPrompt('step5b')" class="absolute top-1.5 right-1.5 px-2 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-400 rounded cursor-pointer">{{ copiedPrompt() === 'step5b' ? 'Copied!' : 'Copy' }}</button>
            </div>
          </div>
        </div>

      </div>

      <!-- Light right panel -->
      <div class="flex-1 flex flex-col justify-center p-8">
        <h1 class="text-2xl font-bold text-gray-800 mb-1 md:hidden">Prompt CV</h1>
        <p class="text-gray-500 text-sm mb-6 md:hidden">AI-powered CV generation via MCP</p>

        <p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">MCP Server URL</p>
        <div class="flex gap-2 mb-2 max-w-md">
          <input type="text" [value]="mcpUrl()" readonly class="flex-1 border border-gray-300 rounded px-2.5 py-1.5 text-sm bg-white font-mono text-gray-700 min-w-0" />
          <button (click)="copyMcpUrl()" class="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 cursor-pointer shrink-0">{{ copied() ? 'Copied!' : 'Copy' }}</button>
        </div>
        <p class="text-xs text-gray-500 mb-8 max-w-md">Add to <a href="https://claude.ai" target="_blank" class="text-blue-600 hover:underline">Claude</a>, <a href="https://chatgpt.com" target="_blank" class="text-blue-600 hover:underline">ChatGPT</a>, or any MCP-compatible AI client.</p>

        <div class="max-w-md">
          <p class="text-xs text-gray-400 mb-3">Manage settings, templates & tracking</p>
          <button (click)="auth.login()" class="flex items-center justify-center gap-3 bg-white border border-gray-300 rounded-lg px-6 py-2.5 text-gray-700 font-medium hover:bg-gray-50 transition-colors cursor-pointer">
            <svg class="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Sign in with Google
          </button>
          @if (error()) { <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mt-3 text-sm">{{ error() }}</div> }
        </div>

        <div class="mt-8 flex gap-4 text-xs text-gray-400 max-w-md items-center">
          @if (userCount() > 0) {
            <span>{{ userCount() }} {{ userCount() === 1 ? 'user' : 'users' }}</span>
            <span class="text-gray-300">|</span>
            <span>{{ totalCvs() }} CVs generated</span>
            <span class="text-gray-300">|</span>
          }
          <a href="https://github.com/apostx/prompt-cv" target="_blank" class="hover:text-gray-600 transition-colors flex items-center gap-1">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
            GitHub
          </a>
        </div>

        <!-- Mobile-only steps (hidden on desktop where left panel shows them) -->
        <div class="md:hidden mt-8 border-t border-gray-200 pt-6">
          <h2 class="text-sm font-semibold text-gray-700 mb-3">How to use</h2>
          <div class="space-y-4 text-sm">
            <div>
              <p class="text-gray-600"><span class="font-semibold text-gray-800">1.</span> Add this MCP URL as a Connector in Claude Desktop</p>
              <p class="text-gray-400 text-xs mt-0.5">(works with ChatGPT and other MCP-compatible clients)</p>
            </div>
            <div>
              <p class="text-gray-600"><span class="font-semibold text-gray-800">2.</span> Click Connect &mdash; sign in with Google</p>
            </div>
            <div>
              <p class="text-gray-600 mb-1.5"><span class="font-semibold text-gray-800">3.</span> Add your work history</p>
              <div class="relative bg-gray-100 border border-gray-200 rounded px-3 py-2 pr-14 font-mono text-xs text-gray-600 leading-relaxed">
                {{ promptStep3() }}
                <button (click)="copyPrompt('step3')" class="absolute top-1.5 right-1.5 px-2 py-0.5 text-[10px] bg-gray-200 hover:bg-gray-300 text-gray-500 rounded cursor-pointer">{{ copiedPrompt() === 'step3' ? 'Copied!' : 'Copy' }}</button>
              </div>
            </div>
            <div>
              <p class="text-gray-600 mb-1.5"><span class="font-semibold text-gray-800">4.</span> Generate a CV</p>
              <div class="relative bg-gray-100 border border-gray-200 rounded px-3 py-2 pr-14 font-mono text-xs text-gray-600 leading-relaxed">
                {{ promptStep4() }}
                <button (click)="copyPrompt('step4')" class="absolute top-1.5 right-1.5 px-2 py-0.5 text-[10px] bg-gray-200 hover:bg-gray-300 text-gray-500 rounded cursor-pointer">{{ copiedPrompt() === 'step4' ? 'Copied!' : 'Copy' }}</button>
              </div>
            </div>
            <div>
              <p class="text-gray-600 mb-1.5"><span class="font-semibold text-gray-800">5.</span> Improve future results</p>
              <div class="relative bg-gray-100 border border-gray-200 rounded px-3 py-2 pr-14 font-mono text-xs text-gray-600 leading-relaxed mb-2">
                {{ promptStep5a() }}
                <button (click)="copyPrompt('step5a')" class="absolute top-1.5 right-1.5 px-2 py-0.5 text-[10px] bg-gray-200 hover:bg-gray-300 text-gray-500 rounded cursor-pointer">{{ copiedPrompt() === 'step5a' ? 'Copied!' : 'Copy' }}</button>
              </div>
              <div class="relative bg-gray-100 border border-gray-200 rounded px-3 py-2 pr-14 font-mono text-xs text-gray-600 leading-relaxed">
                {{ promptStep5b() }}
                <button (click)="copyPrompt('step5b')" class="absolute top-1.5 right-1.5 px-2 py-0.5 text-[10px] bg-gray-200 hover:bg-gray-300 text-gray-500 rounded cursor-pointer">{{ copiedPrompt() === 'step5b' ? 'Copied!' : 'Copy' }}</button>
              </div>
            </div>
          </div>
          @if (userCount() > 0) {
            <div class="mt-6 text-xs text-gray-400">{{ userCount() }} users &middot; {{ totalCvs() }} CVs generated</div>
          }
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent implements OnInit {
  auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private userApi = inject(UserApiService);
  error = signal('');
  userCount = signal(0);
  totalCvs = signal(0);
  mcpUrl = signal('');
  copied = signal(false);
  copiedPrompt = signal('');

  promptStep3 = signal('Update my CV context per update_cv_context with: ');
  promptStep4 = signal('Process this job per get_cv_instructions and generate a CV: ');
  promptStep5a = signal('Update my instructions per update_cv_instructions with: ');
  promptStep5b = signal('Update my context per update_cv_context with: ');

  ngOnInit() {
    const errorParam = this.route.snapshot.queryParamMap.get('error');
    if (errorParam === 'missing_scopes') {
      this.error.set('Google Drive access is required so Prompt CV can read your documents and save generated CVs. Please try again and grant the requested permissions.');
    }

    this.userApi.getStats().subscribe({
      next: (stats) => {
        this.userCount.set(stats.userCount);
        this.totalCvs.set(stats.totalCvsGenerated);
      },
    });

    this.userApi.getConfig().subscribe({
      next: (config) => {
        this.mcpUrl.set(config.mcpUrl);
        if (config.prompts?.step3) this.promptStep3.set(config.prompts.step3);
        if (config.prompts?.step4) this.promptStep4.set(config.prompts.step4);
        if (config.prompts?.step5a) this.promptStep5a.set(config.prompts.step5a);
        if (config.prompts?.step5b) this.promptStep5b.set(config.prompts.step5b);
      },
    });
  }

  copyMcpUrl() {
    navigator.clipboard.writeText(this.mcpUrl());
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  copyPrompt(step: string) {
    const textMap: Record<string, () => string> = {
      step3: () => this.promptStep3(),
      step4: () => this.promptStep4(),
      step5a: () => this.promptStep5a(),
      step5b: () => this.promptStep5b(),
    };
    const text = textMap[step]?.() || '';
    navigator.clipboard.writeText(text);
    this.copiedPrompt.set(step);
    setTimeout(() => this.copiedPrompt.set(''), 2000);
  }
}
