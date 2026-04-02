import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { UserApiService, type CvHistoryRecord } from '../../services/user-api.service';
import { type ApplicationStatus } from './history.component';

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; color: string; bg: string; border: string }> = {
  created: { label: 'Created', color: 'text-gray-600', bg: 'bg-gray-100', border: 'border-gray-200' },
  applied: { label: 'Applied', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  refused: { label: 'Refused', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
  passed: { label: 'Passed', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
};

@Component({
  selector: 'app-admin-history',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="bg-white rounded-lg shadow-sm p-6">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-semibold text-gray-800">All CV Generations</h3>
        <button
          (click)="load()"
          class="text-sm text-blue-600 hover:text-blue-700 cursor-pointer"
        >Refresh</button>
      </div>

      @if (loading()) {
        <p class="text-gray-500">Loading...</p>
      } @else if (records().length === 0) {
        <div class="text-center py-12">
          <p class="text-gray-400 text-sm">No CV generation history yet.</p>
        </div>
      } @else {
        <div class="space-y-3">
          @for (record of records(); track record.createdAt + record.userId) {
            <div class="border rounded-lg p-4 transition-colors"
              [class]="getCardBorder(record.status)">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <a
                      [href]="record.documentUrl"
                      target="_blank"
                      class="text-sm font-medium text-blue-600 hover:text-blue-700 truncate"
                    >{{ record.stats?.jobTitle || getPositionLabel(record) }}</a>
                    @if (record.stats) {
                      @if (record.stats.rating != null) {
                        <span class="text-xs font-medium px-1.5 py-0.5 rounded"
                          [class]="getRatingClass(record.stats!.rating!)"
                        >{{ record.stats!.rating }}/10</span>
                      }
                    } @else {
                      <span class="text-xs text-gray-400 px-1.5 py-0.5 rounded bg-gray-50"
                        title="Rating not available — analytics were not provided during generation"
                      >—/10</span>
                    }
                    <span class="text-xs font-medium px-2 py-0.5 rounded-full"
                      [class]="getStatusClasses(record.status)"
                    >{{ getStatusLabel(record.status) }}</span>
                  </div>
                  <p class="text-xs text-gray-500 mt-0.5">
                    {{ record.email }}
                  </p>
                  <p class="text-xs text-gray-400 mt-0.5">
                    {{ record.createdAt | date:'medium' }}
                  </p>
                </div>
              </div>

              @if (record.stats) {
                <div class="mt-2 space-y-1">
                  @if (record.stats.matchEvaluation) {
                    <div>
                      <button
                        (click)="toggleExpanded(record.userId + record.createdAt + '-eval')"
                        class="text-xs text-gray-500 hover:text-gray-700 cursor-pointer flex items-center gap-1"
                      >
                        <span class="transition-transform" [class.rotate-90]="isExpanded(record.userId + record.createdAt + '-eval')">&#9654;</span>
                        Match evaluation
                      </button>
                      @if (isExpanded(record.userId + record.createdAt + '-eval')) {
                        <p class="text-xs text-gray-600 mt-1 pl-3 border-l-2 border-gray-200 whitespace-pre-wrap">
                          {{ record.stats!.matchEvaluation }}
                        </p>
                      }
                    </div>
                  }
                  @if (record.stats.jobAnalysis) {
                    <div>
                      <button
                        (click)="toggleExpanded(record.userId + record.createdAt + '-analysis')"
                        class="text-xs text-gray-500 hover:text-gray-700 cursor-pointer flex items-center gap-1"
                      >
                        <span class="transition-transform" [class.rotate-90]="isExpanded(record.userId + record.createdAt + '-analysis')">&#9654;</span>
                        Job analysis
                      </button>
                      @if (isExpanded(record.userId + record.createdAt + '-analysis')) {
                        <p class="text-xs text-gray-600 mt-1 pl-3 border-l-2 border-gray-200 whitespace-pre-wrap">
                          {{ record.stats!.jobAnalysis }}
                        </p>
                      }
                    </div>
                  }
                  @if (record.stats.jobDescription) {
                    <div>
                      <button
                        (click)="toggleExpanded(record.userId + record.createdAt + '-desc')"
                        class="text-xs text-gray-500 hover:text-gray-700 cursor-pointer flex items-center gap-1"
                      >
                        <span class="transition-transform" [class.rotate-90]="isExpanded(record.userId + record.createdAt + '-desc')">&#9654;</span>
                        Job description
                      </button>
                      @if (isExpanded(record.userId + record.createdAt + '-desc')) {
                        <p class="text-xs text-gray-600 mt-1 pl-3 border-l-2 border-gray-200 whitespace-pre-wrap">
                          {{ record.stats!.jobDescription }}
                        </p>
                      }
                    </div>
                  }
                  @if (record.stats.jobLink) {
                    <a
                      [href]="record.stats!.jobLink"
                      target="_blank"
                      class="text-xs text-blue-500 hover:text-blue-600 hover:underline inline-block"
                    >View job posting</a>
                  }
                </div>
              } @else {
                <p class="mt-2 text-xs text-gray-400 italic"
                  title="Analytics were not provided during generation — only the generated document link is tracked"
                >No analytics data</p>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class AdminHistoryComponent implements OnInit {
  private userApi = inject(UserApiService);

  records = signal<CvHistoryRecord[]>([]);
  loading = signal(false);
  expanded = signal<Set<string>>(new Set());

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.userApi.getAdminHistory().subscribe({
      next: (res) => {
        this.records.set(res.history);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  toggleExpanded(key: string) {
    const current = new Set(this.expanded());
    if (current.has(key)) {
      current.delete(key);
    } else {
      current.add(key);
    }
    this.expanded.set(current);
  }

  isExpanded(key: string): boolean {
    return this.expanded().has(key);
  }

  getStatusLabel(status: string): string {
    return STATUS_CONFIG[status as ApplicationStatus]?.label || status;
  }

  getStatusClasses(status: string): string {
    const config = STATUS_CONFIG[status as ApplicationStatus];
    return config ? `${config.color} ${config.bg}` : 'text-gray-600 bg-gray-100';
  }

  getCardBorder(status: string): string {
    const config = STATUS_CONFIG[status as ApplicationStatus];
    return config ? config.border : 'border-gray-200';
  }

  getPositionLabel(record: CvHistoryRecord): string {
    const data = record.cvData as Record<string, unknown> | undefined;
    const app = data?.['application'] as Record<string, unknown> | undefined;
    const position = app?.['position'] as string | undefined;
    const company = app?.['company'] as string | undefined;
    if (position && company) return `${position} @ ${company}`;
    if (position) return position;
    if (company) return company;
    return 'Untitled position';
  }

  getRatingClass(rating: number): string {
    if (rating >= 8) return 'text-green-700 bg-green-50';
    if (rating >= 5) return 'text-yellow-700 bg-yellow-50';
    return 'text-red-700 bg-red-50';
  }
}
