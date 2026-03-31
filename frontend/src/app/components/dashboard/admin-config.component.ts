import { Component, inject, signal, OnInit } from '@angular/core';
import { UserApiService, type ConfigEntry } from '../../services/user-api.service';

interface ConfigField {
  key: string;
  label: string;
  rows: number;
}

@Component({
  selector: 'app-admin-config',
  standalone: true,
  template: `
    @if (loading()) {
      <p class="text-gray-500">Loading config...</p>
    } @else {
      @if (error()) { <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{{ error() }}</div> }
      @if (success()) { <div class="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-4 text-sm">{{ success() }}</div> }

      <div class="space-y-8">
        @for (section of sections; track section.title) {
          <div>
            <h3 class="text-sm font-semibold text-gray-700 mb-3">{{ section.title }}</h3>
            <div class="space-y-4">
              @for (field of section.fields; track field.key) {
                <div class="border border-gray-200 rounded-lg p-4">
                  <div class="flex items-center justify-between mb-2">
                    <label class="text-sm font-medium text-gray-600">{{ field.label }}</label>
                    <span class="text-xs px-2 py-0.5 rounded" [class]="isCustom(field.key) ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'">
                      {{ isCustom(field.key) ? 'Custom' : 'Default' }}
                    </span>
                  </div>
                  <textarea
                    [rows]="field.rows"
                    class="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono text-gray-700 resize-y"
                    [value]="getValue(field.key)"
                    (input)="onEdit(field.key, $event)"
                  ></textarea>
                  <div class="flex gap-2 mt-2">
                    <button
                      (click)="save(field.key)"
                      [disabled]="saving() === field.key || !isDirty(field.key)"
                      class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 cursor-pointer disabled:cursor-default"
                    >{{ saving() === field.key ? 'Saving...' : 'Save' }}</button>
                    @if (isCustom(field.key)) {
                      <button
                        (click)="reset(field.key)"
                        [disabled]="saving() === field.key"
                        class="px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded hover:bg-gray-50 cursor-pointer disabled:cursor-default"
                      >Reset to original</button>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class AdminConfigComponent implements OnInit {
  private userApi = inject(UserApiService);

  loading = signal(true);
  error = signal('');
  success = signal('');
  saving = signal('');

  private configValues = signal<Record<string, string>>({});
  private defaults = signal<Record<string, string>>({});
  private edits = signal<Record<string, string>>({});
  private customKeys = signal<Set<string>>(new Set());

  sections = [
    {
      title: 'Default Files',
      fields: [
        { key: 'default-instructions', label: 'Instructions (AI prompt)', rows: 12 },
        { key: 'default-template', label: 'CV Template (Handlebars schema)', rows: 12 },
      ],
    },
    {
      title: 'Login Page Prompts',
      fields: [
        { key: 'login-prompt-step3', label: 'Step 3 — Add work history', rows: 2 },
        { key: 'login-prompt-step4', label: 'Step 4 — Generate a CV', rows: 2 },
        { key: 'login-prompt-step5a', label: 'Step 5a — Update instructions', rows: 2 },
        { key: 'login-prompt-step5b', label: 'Step 5b — Update context', rows: 2 },
      ],
    },
  ];

  private readonly promptDefaults: Record<string, string> = {
    'login-prompt-step3': 'Update my CV context per update_cv_context with: ',
    'login-prompt-step4': 'Process this job per get_cv_instructions and generate a CV: ',
    'login-prompt-step5a': 'Update my instructions per update_cv_instructions with: ',
    'login-prompt-step5b': 'Update my context per update_cv_context with: ',
  };

  ngOnInit() {
    this.loadData();
  }

  private loadData() {
    this.loading.set(true);

    // Fetch admin config
    this.userApi.getAdminConfig().subscribe({
      next: (res) => {
        const values: Record<string, string> = {};
        const keys = new Set<string>();
        for (const entry of res.config) {
          values[entry.key] = entry.value;
          keys.add(entry.key);
        }
        this.configValues.set(values);
        this.customKeys.set(keys);
        this.edits.set({});
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.error || 'Failed to load config');
        this.loading.set(false);
      },
    });

    // Fetch static file defaults
    fetch('/defaults/instructions.txt').then((r) => r.ok ? r.text() : '').then((text) => {
      this.defaults.update((d) => ({ ...d, 'default-instructions': text }));
    });
    fetch('/defaults/schema.txt').then((r) => r.ok ? r.text() : '').then((text) => {
      this.defaults.update((d) => ({ ...d, 'default-template': text }));
    });
  }

  getValue(key: string): string {
    const edits = this.edits();
    if (key in edits) return edits[key];
    const config = this.configValues();
    if (key in config) return config[key];
    return this.defaults()[key] || this.promptDefaults[key] || '';
  }

  isCustom(key: string): boolean {
    return this.customKeys().has(key);
  }

  isDirty(key: string): boolean {
    const edits = this.edits();
    if (!(key in edits)) return false;
    const current = this.configValues()[key] ?? this.defaults()[key] ?? this.promptDefaults[key] ?? '';
    return edits[key] !== current;
  }

  onEdit(key: string, event: Event) {
    const value = (event.target as HTMLTextAreaElement).value;
    this.edits.update((e) => ({ ...e, [key]: value }));
  }

  save(key: string) {
    const value = this.edits()[key] ?? this.getValue(key);
    this.saving.set(key);
    this.error.set('');
    this.success.set('');
    this.userApi.setAdminConfig(key, value).subscribe({
      next: () => {
        this.configValues.update((v) => ({ ...v, [key]: value }));
        this.customKeys.update((k) => new Set([...k, key]));
        this.edits.update((e) => { const n = { ...e }; delete n[key]; return n; });
        this.saving.set('');
        this.success.set(`Saved "${key}" successfully.`);
        setTimeout(() => this.success.set(''), 3000);
      },
      error: (err) => {
        this.saving.set('');
        this.error.set(err?.error?.error || 'Failed to save');
      },
    });
  }

  reset(key: string) {
    this.saving.set(key);
    this.error.set('');
    this.success.set('');
    this.userApi.deleteAdminConfig(key).subscribe({
      next: () => {
        this.configValues.update((v) => { const n = { ...v }; delete n[key]; return n; });
        this.customKeys.update((k) => { const n = new Set(k); n.delete(key); return n; });
        this.edits.update((e) => { const n = { ...e }; delete n[key]; return n; });
        this.saving.set('');
        this.success.set(`Reset "${key}" to default.`);
        setTimeout(() => this.success.set(''), 3000);
      },
      error: (err) => {
        this.saving.set('');
        this.error.set(err?.error?.error || 'Failed to reset');
      },
    });
  }
}
