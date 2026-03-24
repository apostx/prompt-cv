import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, of } from 'rxjs';
import { debounceTime, switchMap, catchError, map } from 'rxjs/operators';
import {
  UserApiService,
  type UserSettings,
  type SettingsValidation,
  type DocValidation,
} from '../../services/user-api.service';
import { GooglePickerService } from '../../services/google-picker.service';

type StringSettingsField = 'folderPath' | 'contextDocId' | 'instructionsDocId' | 'templateDocId';

const DOC_ID_PATTERN = /^[a-zA-Z0-9_-]{10,}$/;

const DEFAULT_NAMES: Record<string, string> = {
  context: 'My CV Context',
  instructions: 'My CV Instructions',
  template: 'My CV Template',
};

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
          <!-- Folder path -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Folder path for generated CVs
            </label>
            <div class="flex gap-2">
              <input
                type="text"
                [(ngModel)]="settings.folderPath"
                placeholder=".prompt-cv/generated"
                class="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                [class]="!settings.folderPath?.trim() ? 'border-orange-300 bg-orange-50' : 'border-gray-300'"
              />
              <button
                (click)="browseFolder('folderPath')"
                [disabled]="browsing()"
                class="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >{{ browsing() ? 'Opening...' : 'Browse' }}</button>
            </div>
            <p class="text-xs text-gray-400 mt-1">
              Type a path (e.g. cv/generated) or use Browse to select a Google Drive folder.
            </p>
          </div>

          <!-- Context Doc -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Context Doc ID</label>
            <div class="flex gap-2">
              <input
                type="text"
                [(ngModel)]="settings.contextDocId"
                (ngModelChange)="onDocIdChange('contextDocId', $event)"
                placeholder="Google Doc ID (required)"
                class="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                [class]="!settings.contextDocId?.trim() ? 'border-orange-300 bg-orange-50' : 'border-gray-300'"
              />
              <button (click)="browse('contextDocId')" [disabled]="browsing()"
                class="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >{{ browsing() ? 'Opening...' : 'Browse' }}</button>
              @if (!settings.contextDocId) {
                <button (click)="createDefault('context', 'contextDocId')" [disabled]="creating()"
                  class="px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >{{ creating() === 'context' ? 'Creating...' : 'Create from template' }}</button>
              }
            </div>
            <div class="min-h-8 mt-1.5">
              @if (validation()['contextDocId']; as v) {
                @if (v.valid) {
                  <a [href]="'https://docs.google.com/document/d/' + settings.contextDocId"
                     target="_blank" class="bg-gray-800 hover:bg-gray-700 text-white text-xs rounded-md px-3 py-1.5 flex items-center gap-2 no-underline cursor-pointer transition-colors">
                    <span class="text-green-400">✓</span>
                    <span class="truncate">{{ v.title }}</span>
                    @if (v.path) {
                      <span class="text-gray-500 shrink-0">{{ v.path }}</span>
                    }
                    <span class="ml-auto text-gray-500 shrink-0">↗</span>
                  </a>
                } @else {
                  <div class="bg-red-900 text-red-200 text-xs rounded-md px-3 py-1.5">✗ {{ v.error }}</div>
                }
              } @else if (checking()['contextDocId']) {
                <div class="bg-gray-800 text-gray-400 text-xs rounded-md px-3 py-1.5 flex items-center gap-2">
                  <span class="inline-block w-3 h-3 border-2 border-gray-600 border-t-gray-400 rounded-full animate-spin"></span>
                  <span>Checking...</span>
                </div>
              }
            </div>
            <p class="text-xs text-gray-400">
              A Google Doc with your work history and experience.
            </p>
          </div>

          <!-- Instructions Doc -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Instructions Doc ID</label>
            <div class="flex gap-2">
              <input
                type="text"
                [(ngModel)]="settings.instructionsDocId"
                (ngModelChange)="onDocIdChange('instructionsDocId', $event)"
                placeholder="Google Doc ID (required)"
                class="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                [class]="!settings.instructionsDocId?.trim() ? 'border-orange-300 bg-orange-50' : 'border-gray-300'"
              />
              <button (click)="browse('instructionsDocId')" [disabled]="browsing()"
                class="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >{{ browsing() ? 'Opening...' : 'Browse' }}</button>
              @if (!settings.instructionsDocId) {
                <button (click)="createDefault('instructions', 'instructionsDocId')" [disabled]="creating()"
                  class="px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >{{ creating() === 'instructions' ? 'Creating...' : 'Create from template' }}</button>
              }
            </div>
            <div class="min-h-8 mt-1.5">
              @if (validation()['instructionsDocId']; as v) {
                @if (v.valid) {
                  <a [href]="'https://docs.google.com/document/d/' + settings.instructionsDocId"
                     target="_blank" class="bg-gray-800 hover:bg-gray-700 text-white text-xs rounded-md px-3 py-1.5 flex items-center gap-2 no-underline cursor-pointer transition-colors">
                    <span class="text-green-400">✓</span>
                    <span class="truncate">{{ v.title }}</span>
                    @if (v.path) {
                      <span class="text-gray-500 shrink-0">{{ v.path }}</span>
                    }
                    <span class="ml-auto text-gray-500 shrink-0">↗</span>
                  </a>
                } @else {
                  <div class="bg-red-900 text-red-200 text-xs rounded-md px-3 py-1.5">✗ {{ v.error }}</div>
                }
              } @else if (checking()['instructionsDocId']) {
                <div class="bg-gray-800 text-gray-400 text-xs rounded-md px-3 py-1.5 flex items-center gap-2">
                  <span class="inline-block w-3 h-3 border-2 border-gray-600 border-t-gray-400 rounded-full animate-spin"></span>
                  <span>Checking...</span>
                </div>
              }
            </div>
            <p class="text-xs text-gray-400">
              AI generation rules and prompt. See the
              <a href="/defaults/instructions.txt" target="_blank" class="text-blue-600 hover:text-blue-800 underline font-medium">default instructions</a>
              for reference.
            </p>
          </div>

          <!-- Template Doc -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">CV Template Doc ID</label>
            <div class="flex gap-2">
              <input
                type="text"
                [(ngModel)]="settings.templateDocId"
                (ngModelChange)="onDocIdChange('templateDocId', $event)"
                placeholder="Google Doc ID (required)"
                class="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                [class]="!settings.templateDocId?.trim() ? 'border-orange-300 bg-orange-50' : 'border-gray-300'"
              />
              <button (click)="browse('templateDocId')" [disabled]="browsing()"
                class="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >{{ browsing() ? 'Opening...' : 'Browse' }}</button>
              @if (!settings.templateDocId) {
                <button (click)="createDefault('template', 'templateDocId')" [disabled]="creating()"
                  class="px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >{{ creating() === 'template' ? 'Creating...' : 'Create from template' }}</button>
              }
            </div>
            <div class="min-h-8 mt-1.5">
              @if (validation()['templateDocId']; as v) {
                @if (v.valid) {
                  <a [href]="'https://docs.google.com/document/d/' + settings.templateDocId"
                     target="_blank" class="bg-gray-800 hover:bg-gray-700 text-white text-xs rounded-md px-3 py-1.5 flex items-center gap-2 no-underline cursor-pointer transition-colors">
                    <span class="text-green-400">✓</span>
                    <span class="truncate">{{ v.title }}</span>
                    @if (v.path) {
                      <span class="text-gray-500 shrink-0">{{ v.path }}</span>
                    }
                    <span class="ml-auto text-gray-500 shrink-0">↗</span>
                  </a>
                } @else {
                  <div class="bg-red-900 text-red-200 text-xs rounded-md px-3 py-1.5">✗ {{ v.error }}</div>
                }
              } @else if (checking()['templateDocId']) {
                <div class="bg-gray-800 text-gray-400 text-xs rounded-md px-3 py-1.5 flex items-center gap-2">
                  <span class="inline-block w-3 h-3 border-2 border-gray-600 border-t-gray-400 rounded-full animate-spin"></span>
                  <span>Checking...</span>
                </div>
              }
            </div>
            <p class="text-xs text-gray-400">
              A Google Doc using
              <a href="https://handlebarsjs.com/" target="_blank" class="text-blue-600 hover:text-blue-800 underline font-medium">Handlebars</a>
              syntax ({{"{{header.name}}"}}, {{"{{#each experience}}"}}, etc.).
              See the
              <a href="/defaults/schema.txt" target="_blank" class="text-blue-600 hover:text-blue-800 underline font-medium">default schema</a>
              for the expected data structure.
            </p>
          </div>

          <!-- Save -->
          <div class="flex items-center gap-3">
            <button (click)="save()" [disabled]="saving() || isChecking() || !allFieldsValid()"
              class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
            >{{ saving() ? 'Saving...' : 'Save' }}</button>
            @if (saved()) {
              <span class="text-sm text-green-600">Saved</span>
            }
            @if (saveError()) {
              <span class="text-sm text-red-500">All fields are required. Fix errors and try again.</span>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class SettingsComponent implements OnInit, OnDestroy {
  private userApi = inject(UserApiService);
  private pickerService = inject(GooglePickerService);

  settings: UserSettings = {};
  loading = signal(true);
  loadError = signal(false);
  saving = signal(false);
  saved = signal(false);
  saveError = signal(false);
  validation = signal<SettingsValidation>({});
  checking = signal<Record<string, boolean>>({});
  isChecking = computed(() => Object.keys(this.checking()).length > 0);
  hasErrors = computed(() => {
    const v = this.validation();
    return Object.values(v).some((val) => !val.valid);
  });
  allFieldsValid = computed(() => {
    const s = this.settings;
    const v = this.validation();
    const FOLDER_PATH_PATTERN = /^[a-zA-Z0-9._\-/]+$/;
    if (!s.folderPath?.trim() || !FOLDER_PATH_PATTERN.test(s.folderPath)) return false;
    for (const field of ['contextDocId', 'instructionsDocId', 'templateDocId'] as const) {
      const val = s[field]?.trim();
      if (!val) return false;
      if (!v[field] || !v[field].valid) return false;
    }
    return true;
  });
  browsing = signal(false);
  creating = signal<string | false>(false);

  private validateSubject = new Subject<{ field: string; value: string }>();
  private validateSub?: Subscription;

  ngOnInit() {
    this.userApi.getSettings().subscribe({
      next: (res) => {
        this.settings = res.settings || {};
        this.loading.set(false);
        this.validateAllFields();
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
      },
    });

    this.validateSub = this.validateSubject
      .pipe(
        debounceTime(800),
        switchMap(({ field, value }) => {
          if (!value?.trim() || !DOC_ID_PATTERN.test(value)) {
            return of({ field, result: null as DocValidation | null });
          }
          return this.userApi.validateDoc(value).pipe(
            map((result) => ({ field, result: result as DocValidation | null })),
            catchError(() =>
              of({ field, result: { valid: false, error: 'Validation failed' } as DocValidation | null }),
            ),
          );
        }),
      )
      .subscribe(({ field, result }) => {
        this.setFieldChecking(field, false);
        this.setFieldValidation(field, result);
      });
  }

  ngOnDestroy() {
    this.validateSub?.unsubscribe();
  }

  private validateAllFields() {
    for (const field of ['contextDocId', 'instructionsDocId', 'templateDocId'] as const) {
      const value = this.settings[field];
      if (value?.trim() && DOC_ID_PATTERN.test(value)) {
        this.setFieldChecking(field, true);
        this.userApi.validateDoc(value).subscribe({
          next: (result) => {
            this.setFieldChecking(field, false);
            this.setFieldValidation(field, result);
          },
          error: () => this.setFieldChecking(field, false),
        });
      }
    }
  }

  private setFieldChecking(field: string, value: boolean) {
    const current = { ...this.checking() };
    if (value) {
      current[field] = true;
    } else {
      delete current[field];
    }
    this.checking.set(current);
  }

  private setFieldValidation(field: string, result: DocValidation | null) {
    const current = { ...this.validation() };
    if (result) {
      current[field] = result;
    } else {
      delete current[field];
    }
    this.validation.set(current);
  }

  onDocIdChange(field: string, value: string) {
    if (!value?.trim()) {
      this.setFieldValidation(field, null);
      this.setFieldChecking(field, false);
      return;
    }
    this.setFieldValidation(field, null);
    this.setFieldChecking(field, true);
    this.validateSubject.next({ field, value });
  }

  browse(field: StringSettingsField) {
    this.browsing.set(true);
    this.pickerService.pickDocument().subscribe({
      next: (result) => {
        if (result) {
          this.settings[field] = result.id;
          this.validateField(field, result.id);
        }
        this.browsing.set(false);
      },
      error: () => this.browsing.set(false),
    });
  }

  browseFolder(field: StringSettingsField) {
    this.browsing.set(true);
    this.pickerService.pickFolder().subscribe({
      next: (result) => {
        if (result) {
          this.settings[field] = result.id;
          this.userApi.resolveFolder(result.id).subscribe({
            next: (res) => {
              if (res.path) this.settings[field] = res.path;
              this.browsing.set(false);
            },
            error: () => this.browsing.set(false),
          });
        } else {
          this.browsing.set(false);
        }
      },
      error: () => this.browsing.set(false),
    });
  }

  createDefault(type: 'instructions' | 'template' | 'context', field: StringSettingsField) {
    const name = window.prompt('Document name:', DEFAULT_NAMES[type] || '');
    if (name === null) return;

    this.creating.set(type);
    this.pickerService.pickFolder().subscribe({
      next: (folder) => {
        this.doCreate(type, field, name || undefined, folder?.id);
      },
      error: () => {
        this.doCreate(type, field, name || undefined);
      },
    });
  }

  private doCreate(
    type: 'instructions' | 'template' | 'context',
    field: StringSettingsField,
    title?: string,
    folderId?: string,
  ) {
    this.userApi.createDefaultDoc(type, folderId, title).subscribe({
      next: (result) => {
        this.settings[field] = result.documentId;
        this.creating.set(false);
        this.validateField(field, result.documentId);
      },
      error: () => this.creating.set(false),
    });
  }

  private validateField(field: string, value: string) {
    if (DOC_ID_PATTERN.test(value)) {
      this.setFieldChecking(field, true);
      this.userApi.validateDoc(value).subscribe({
        next: (result) => {
          this.setFieldChecking(field, false);
          this.setFieldValidation(field, result);
        },
        error: () => this.setFieldChecking(field, false),
      });
    }
  }

  save() {
    this.saving.set(true);
    this.saved.set(false);
    this.saveError.set(false);
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
