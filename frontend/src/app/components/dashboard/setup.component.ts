import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, switchMap, catchError, map } from 'rxjs/operators';
import { of } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import {
  UserApiService,
  type SetupFieldValue,
  type DocValidation,
} from '../../services/user-api.service';
import { GooglePickerService } from '../../services/google-picker.service';

const DOC_ID_PATTERN = /^[a-zA-Z0-9_-]{10,}$/;

interface SetupRow {
  key: string;
  label: string;
  description: string;
  defaultDescription: string;
  browseType: 'folder' | 'doc';
}

const ROWS: SetupRow[] = [
  {
    key: 'folder',
    label: 'Generated CVs folder',
    description: 'Where your generated CVs will be saved',
    defaultDescription: 'Creates .prompt-cv/generated in your Google Drive',
    browseType: 'folder',
  },
  {
    key: 'context',
    label: 'CV Context',
    description: 'Your work history and experience',
    defaultDescription: 'Creates an empty cv-context document in .prompt-cv/',
    browseType: 'doc',
  },
  {
    key: 'instructions',
    label: 'CV Instructions',
    description: 'AI generation rules and prompt',
    defaultDescription: 'Creates cv-instructions from the default template',
    browseType: 'doc',
  },
  {
    key: 'template',
    label: 'CV Template',
    description: 'Handlebars template for CV output',
    defaultDescription: 'Creates cv-template from the default schema',
    browseType: 'doc',
  },
];

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="max-w-4xl mx-auto px-6 py-6">
    @if (redirecting()) {
      <div class="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <span class="inline-block w-8 h-8 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin"></span>
        <p class="text-gray-500 text-sm">Connecting to your AI assistant...</p>
      </div>
    } @else {
      <div class="bg-white rounded-lg shadow-sm p-6">
        <h2 class="text-lg font-semibold text-gray-800 mb-1">Set up your workspace</h2>
        <p class="text-sm text-gray-500 mb-6">
          We'll create a <strong>.prompt-cv</strong> folder in your Google Drive with default files.
          Toggle any row to use an existing document instead.
        </p>

        @if (loading()) {
          <div class="flex items-center gap-2 text-gray-400 text-sm">
            <span class="inline-block w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin"></span>
            Checking your Google Drive...
          </div>
        } @else if (loadError()) {
          <p class="text-sm text-red-500">Failed to check existing files. You can still proceed with defaults.</p>
        }

        @if (!loading()) {
          <div class="space-y-3 mb-6">
            @for (row of rows; track row.key) {
              <div class="border border-gray-200 rounded-lg p-4">
                <div class="flex justify-between items-start gap-4">
                  <div class="min-w-0">
                    <div class="text-sm font-medium text-gray-800">{{ row.label }}</div>
                    <div class="text-xs text-gray-400 mt-0.5">{{ row.description }}</div>
                  </div>
                  <button
                    (click)="toggleMode(row.key)"
                    class="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap cursor-pointer shrink-0"
                  >{{ modes()[row.key] === 'default' ? 'Use existing' : 'Create new' }}</button>
                </div>

                @if (modes()[row.key] === 'default') {
                  <p class="text-xs text-gray-500 mt-2 bg-gray-50 rounded px-3 py-2">
                    {{ row.defaultDescription }}
                  </p>
                } @else {
                  <div class="mt-2">
                    <div class="flex gap-2">
                      <input
                        type="text"
                        [ngModel]="manualValues()[row.key]"
                        (ngModelChange)="onManualChange(row.key, $event)"
                        [placeholder]="row.browseType === 'folder' ? 'Folder path or ID' : 'Google Doc ID'"
                        class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        (click)="browse(row)"
                        [disabled]="browsing()"
                        class="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                      >{{ browsing() ? 'Opening...' : 'Browse' }}</button>
                    </div>
                    @if (row.browseType === 'doc') {
                      <div class="min-h-7 mt-1.5">
                        @if (validation()[row.key]; as v) {
                          @if (v.valid) {
                            <a [href]="'https://docs.google.com/document/d/' + manualValues()[row.key]"
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
                        } @else if (checking()[row.key]) {
                          <div class="bg-gray-800 text-gray-400 text-xs rounded-md px-3 py-1.5 flex items-center gap-2">
                            <span class="inline-block w-3 h-3 border-2 border-gray-600 border-t-gray-400 rounded-full animate-spin"></span>
                            <span>Checking...</span>
                          </div>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </div>

          <div class="flex items-center gap-3">
            <button
              (click)="save()"
              [disabled]="saving() || isChecking() || hasErrors()"
              class="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
            >{{ saving() ? 'Setting up...' : 'Continue' }}</button>
            @if (saveError()) {
              <span class="text-sm text-red-500">{{ saveError() }}</span>
            }
          </div>
        }
      </div>
    }
    </div>
  `,
})
export class SetupComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private userApi = inject(UserApiService);
  private pickerService = inject(GooglePickerService);
  private router = inject(Router);

  readonly rows = ROWS;

  loading = signal(true);
  loadError = signal(false);
  saving = signal(false);
  saveError = signal<string | false>(false);
  redirecting = signal(false);
  browsing = signal(false);
  mcpSetup = signal<{ code: string; redirectUri: string; state: string } | null>(null);

  modes = signal<Record<string, 'default' | 'manual'>>({
    folder: 'default',
    context: 'default',
    instructions: 'default',
    template: 'default',
  });

  manualValues = signal<Record<string, string>>({
    folder: '',
    context: '',
    instructions: '',
    template: '',
  });

  validation = signal<Record<string, DocValidation>>({});
  checking = signal<Record<string, boolean>>({});
  isChecking = computed(() => Object.values(this.checking()).some(Boolean));
  hasErrors = computed(() => Object.values(this.validation()).some((v) => !v.valid));

  private validateSubject = new Subject<{ key: string; value: string }>();
  private validateSub?: Subscription;

  ngOnInit() {
    // Check for cached setup data first (survives refresh)
    const cachedData = sessionStorage.getItem('mcpSetupData');
    if (cachedData) {
      try {
        const setup = JSON.parse(cachedData);
        this.mcpSetup.set(setup);
        this.checkExistingFiles();
        this.initValidationPipeline();
        return;
      } catch { /* fall through */ }
    }

    // Fetch MCP setup params (includes JWT), then check for existing files
    const setupToken = sessionStorage.getItem('mcpSetup');
    if (setupToken) {
      this.userApi.getMcpSetup(setupToken).subscribe({
        next: (setup) => {
          this.auth.setToken(setup.jwt);
          this.mcpSetup.set(setup);
          // Cache resolved params so refresh works
          sessionStorage.setItem('mcpSetupData', JSON.stringify({ code: setup.code, redirectUri: setup.redirectUri, state: setup.state }));
          this.checkExistingFiles();
        },
        error: () => {
          sessionStorage.removeItem('mcpSetup');
          this.router.navigate(['/login']);
        },
      });
    } else {
      // Direct navigation (already logged in)
      this.checkExistingFiles();
    }

    this.initValidationPipeline();
  }

  private checkExistingFiles() {
    this.userApi.getSetupCheck().subscribe({
      next: (result) => {
        this.loading.set(false);
        const f = result.files;
        if (f.contextDocId || f.instructionsDocId || f.templateDocId || f.generatedFolderId) {
          const newModes = { ...this.modes() };
          const newValues = { ...this.manualValues() };

          if (f.generatedFolderId) {
            newModes['folder'] = 'manual';
            newValues['folder'] = '.prompt-cv/generated';
          }
          if (f.contextDocId) {
            newModes['context'] = 'manual';
            newValues['context'] = f.contextDocId;
          }
          if (f.instructionsDocId) {
            newModes['instructions'] = 'manual';
            newValues['instructions'] = f.instructionsDocId;
          }
          if (f.templateDocId) {
            newModes['template'] = 'manual';
            newValues['template'] = f.templateDocId;
          }

          this.modes.set(newModes);
          this.manualValues.set(newValues);

          for (const key of ['context', 'instructions', 'template'] as const) {
            const id = newValues[key];
            if (id && DOC_ID_PATTERN.test(id)) {
              this.setChecking(key, true);
              this.userApi.validateDoc(id).subscribe({
                next: (v) => { this.setChecking(key, false); this.setValidation(key, v); },
                error: () => this.setChecking(key, false),
              });
            }
          }
        }
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }

  private initValidationPipeline() {
    this.validateSub = this.validateSubject
      .pipe(
        debounceTime(800),
        switchMap(({ key, value }) => {
          if (!value?.trim() || !DOC_ID_PATTERN.test(value)) {
            return of({ key, result: null as DocValidation | null });
          }
          return this.userApi.validateDoc(value).pipe(
            map((result) => ({ key, result: result as DocValidation | null })),
            catchError(() => of({ key, result: { valid: false, error: 'Validation failed' } as DocValidation | null })),
          );
        }),
      )
      .subscribe(({ key, result }) => {
        this.setChecking(key, false);
        if (result) this.setValidation(key, result);
        else this.clearValidation(key);
      });
  }

  ngOnDestroy() {
    this.validateSub?.unsubscribe();
  }

  toggleMode(key: string) {
    const current = { ...this.modes() };
    current[key] = current[key] === 'default' ? 'manual' : 'default';
    this.modes.set(current);
    if (current[key] === 'default') {
      this.clearValidation(key);
      this.setChecking(key, false);
    }
  }

  onManualChange(key: string, value: string) {
    const current = { ...this.manualValues() };
    current[key] = value;
    this.manualValues.set(current);

    const row = ROWS.find((r) => r.key === key);
    if (row?.browseType === 'doc') {
      if (!value?.trim()) {
        this.clearValidation(key);
        this.setChecking(key, false);
        return;
      }
      this.clearValidation(key);
      this.setChecking(key, true);
      this.validateSubject.next({ key, value });
    }
  }

  browse(row: SetupRow) {
    this.browsing.set(true);
    if (row.browseType === 'folder') {
      this.pickerService.pickFolder().subscribe({
        next: (result) => {
          if (result) {
            this.userApi.resolveFolder(result.id).subscribe({
              next: (res) => {
                const values = { ...this.manualValues() };
                values[row.key] = res.path || result.id;
                this.manualValues.set(values);
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
    } else {
      this.pickerService.pickDocument().subscribe({
        next: (result) => {
          if (result) {
            const values = { ...this.manualValues() };
            values[row.key] = result.id;
            this.manualValues.set(values);
            this.setChecking(row.key, true);
            this.userApi.validateDoc(result.id).subscribe({
              next: (v) => { this.setChecking(row.key, false); this.setValidation(row.key, v); },
              error: () => this.setChecking(row.key, false),
            });
          }
          this.browsing.set(false);
        },
        error: () => this.browsing.set(false),
      });
    }
  }

  save() {
    this.saving.set(true);
    this.saveError.set(false);

    const modes = this.modes();
    const values = this.manualValues();

    const config: Record<string, SetupFieldValue> = {};
    for (const row of ROWS) {
      if (modes[row.key] === 'default') {
        config[row.key] = 'default';
      } else {
        const val = values[row.key]?.trim();
        if (!val) {
          this.saving.set(false);
          this.saveError.set(`Please enter a value for ${row.label} or switch to "Create new".`);
          return;
        }
        config[row.key] = { id: val };
      }
    }

    this.userApi.initSetup(config as { folder: SetupFieldValue; context: SetupFieldValue; instructions: SetupFieldValue; template: SetupFieldValue }).subscribe({
      next: () => {
        this.saving.set(false);
        const setup = this.mcpSetup();
        if (setup) {
          this.redirecting.set(true);
          sessionStorage.removeItem('mcpSetup');
          sessionStorage.removeItem('mcpSetupData');
          const sep = setup.redirectUri.includes('?') ? '&' : '?';
          window.location.href = `${setup.redirectUri}${sep}code=${setup.code}${setup.state ? '&state=' + encodeURIComponent(setup.state) : ''}`;
        } else {
          this.router.navigate(['/settings']);
        }
      },
      error: (err) => {
        this.saving.set(false);
        this.saveError.set(err.error?.error || 'Setup failed. Please try again.');
      },
    });
  }

  private setChecking(key: string, value: boolean) {
    const current = { ...this.checking() };
    if (value) current[key] = true;
    else delete current[key];
    this.checking.set(current);
  }

  private setValidation(key: string, result: DocValidation) {
    const current = { ...this.validation() };
    current[key] = result;
    this.validation.set(current);
  }

  private clearValidation(key: string) {
    const current = { ...this.validation() };
    delete current[key];
    this.validation.set(current);
  }
}
