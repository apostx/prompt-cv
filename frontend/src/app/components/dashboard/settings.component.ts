import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UserApiService, type UserSettings, type SettingsValidation } from '../../services/user-api.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="bg-white rounded-lg shadow-sm p-6">
      <h3 class="text-lg font-semibold text-gray-800 mb-4">Settings</h3>
      @if (loading()) {
        <p class="text-gray-500">Loading...</p>
      } @else if (loadError()) {
        <p class="text-sm text-red-500">Failed to load settings. Please refresh the page.</p>
      } @else {
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Folder path for generated CVs
            </label>
            <input
              type="text"
              [(ngModel)]="settings.folderPath"
              placeholder="cv/generated"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Context Doc ID
            </label>
            <input
              type="text"
              [(ngModel)]="settings.contextDocId"
              placeholder="Google Doc ID"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            @if (validation()['contextDocId']; as v) {
              @if (v.valid) {
                <p class="text-xs text-green-600 mt-1">✓ {{ v.title }}</p>
              } @else {
                <p class="text-xs text-red-500 mt-1">✗ {{ v.error }}</p>
              }
            }
            <p class="text-xs text-gray-400 mt-1">
              A Google Doc with your work history. Leave empty to provide context via instructions or chat.
            </p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Instructions Doc ID
            </label>
            <input
              type="text"
              [(ngModel)]="settings.instructionsDocId"
              placeholder="Google Doc ID"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            @if (validation()['instructionsDocId']; as v) {
              @if (v.valid) {
                <p class="text-xs text-green-600 mt-1">✓ {{ v.title }}</p>
              } @else {
                <p class="text-xs text-red-500 mt-1">✗ {{ v.error }}</p>
              }
            }
            <p class="text-xs text-gray-400 mt-1">
              Leave empty to use
              <a href="/defaults/instructions.txt" target="_blank" class="text-blue-600 hover:text-blue-800 underline font-medium">default instructions</a>.
              Use it as a template to create your own.
            </p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              CV Template Doc ID
            </label>
            <input
              type="text"
              [(ngModel)]="settings.templateDocId"
              placeholder="Google Doc ID"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            @if (validation()['templateDocId']; as v) {
              @if (v.valid) {
                <p class="text-xs text-green-600 mt-1">✓ {{ v.title }}</p>
              } @else {
                <p class="text-xs text-red-500 mt-1">✗ {{ v.error }}</p>
              }
            }
            <p class="text-xs text-gray-400 mt-1">
              A Google Doc using
              <a href="https://handlebarsjs.com/" target="_blank" class="text-blue-600 hover:text-blue-800 underline font-medium">Handlebars</a>
              syntax ({{"{{header.name}}"}}, {{"{{#each experience}}"}}, etc.).
              See the
              <a href="/defaults/schema.txt" target="_blank" class="text-blue-600 hover:text-blue-800 underline font-medium">default schema</a>
              for the expected data structure.
            </p>
          </div>
          <div class="flex items-center gap-3">
            <button
              (click)="save()"
              [disabled]="saving()"
              class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
            >
              {{ saving() ? 'Saving & validating...' : 'Save' }}
            </button>
            @if (saved()) {
              <span class="text-sm text-green-600">Saved</span>
            }
            @if (saveError()) {
              <span class="text-sm text-red-500">Fix invalid document IDs and try again</span>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class SettingsComponent implements OnInit {
  private userApi = inject(UserApiService);

  settings: UserSettings = {};
  loading = signal(true);
  loadError = signal(false);
  saving = signal(false);
  saved = signal(false);
  saveError = signal(false);
  validation = signal<SettingsValidation>({});

  ngOnInit() {
    this.userApi.getSettings().subscribe({
      next: (res) => {
        this.settings = res.settings || {};
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }

  save() {
    this.saving.set(true);
    this.saved.set(false);
    this.saveError.set(false);
    this.validation.set({});
    this.userApi.updateSettings(this.settings).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.saved.set(true);
        if (res.validation) this.validation.set(res.validation);
        setTimeout(() => this.saved.set(false), 3000);
      },
      error: (err) => {
        this.saving.set(false);
        this.saveError.set(true);
        const body = err.error;
        if (body?.validation) this.validation.set(body.validation);
        setTimeout(() => this.saveError.set(false), 5000);
      },
    });
  }
}
