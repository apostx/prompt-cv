import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { UserApiService, type CvHistoryRecord } from '../../services/user-api.service';

export type ApplicationStatus = 'created' | 'applied' | 'refused' | 'passed';

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; color: string; bg: string; border: string }> = {
  created: { label: 'Created', color: 'text-gray-600', bg: 'bg-gray-100', border: 'border-gray-200' },
  applied: { label: 'Applied', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  refused: { label: 'Refused', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
  passed: { label: 'Passed', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
};

// State machine transitions: current state → available next states
const TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  created: ['applied'],
  applied: ['passed', 'refused', 'created'],
  refused: ['created'],
  passed: ['created'],
};

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="bg-white rounded-lg shadow-sm p-6">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-semibold text-gray-800">Application History</h3>
        <button
          (click)="loadHistory()"
          class="text-sm text-blue-600 hover:text-blue-700 cursor-pointer"
        >Refresh</button>
      </div>

      @if (loading()) {
        <p class="text-gray-500">Loading...</p>
      } @else if (records().length === 0) {
        <div class="text-center py-12">
          <p class="text-gray-400 text-sm">No application history yet.</p>
          <p class="text-gray-400 text-xs mt-1">
            History is recorded when the AI provides job analysis during CV generation.
          </p>
        </div>
      } @else {
        <div class="space-y-3">
          @for (record of records(); track record.createdAt) {
            <div class="border rounded-lg p-4 transition-colors"
              [class]="getCardBorder(record.status)">
              <!-- Header row -->
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <a
                      [href]="record.documentUrl"
                      target="_blank"
                      class="text-sm font-medium text-blue-600 hover:text-blue-700 truncate"
                    >{{ record.stats?.jobTitle || 'Untitled position' }}</a>
                    @if (record.stats?.rating != null) {
                      <span class="text-xs font-medium px-1.5 py-0.5 rounded"
                        [class]="getRatingClass(record.stats!.rating!)"
                      >{{ record.stats!.rating }}/10</span>
                    }
                    <span class="text-xs font-medium px-2 py-0.5 rounded-full"
                      [class]="getStatusClasses(record.status)"
                    >{{ getStatusLabel(record.status) }}</span>
                  </div>
                  <p class="text-xs text-gray-400 mt-0.5">
                    {{ record.createdAt | date:'medium' }}
                  </p>
                </div>

                <!-- Transition buttons -->
                <div class="flex gap-1.5 shrink-0">
                  @for (next of getTransitions(record.status); track next) {
                    <button
                      (click)="onTransition(record, next)"
                      class="text-xs font-medium px-2 py-1 rounded border cursor-pointer transition-colors"
                      [class]="getTransitionButtonClass(next)"
                    >{{ getTransitionLabel(record.status, next) }}</button>
                  }
                </div>
              </div>

              <!-- Match evaluation (expandable) -->
              @if (record.stats?.matchEvaluation) {
                <div class="mt-2">
                  <button
                    (click)="toggleExpanded(record.createdAt)"
                    class="text-xs text-gray-500 hover:text-gray-700 cursor-pointer flex items-center gap-1"
                  >
                    <span class="transition-transform" [class.rotate-90]="isExpanded(record.createdAt)">&#9654;</span>
                    Match evaluation
                  </button>
                  @if (isExpanded(record.createdAt)) {
                    <p class="text-xs text-gray-600 mt-1 pl-3 border-l-2 border-gray-200 whitespace-pre-wrap">
                      {{ record.stats!.matchEvaluation }}
                    </p>
                  }
                </div>
              }

              <!-- Job link -->
              @if (record.stats?.jobLink) {
                <div class="mt-2">
                  <a
                    [href]="record.stats!.jobLink"
                    target="_blank"
                    class="text-xs text-blue-500 hover:text-blue-600 hover:underline"
                  >View job posting</a>
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class HistoryComponent implements OnInit {
  private userApi = inject(UserApiService);

  records = signal<CvHistoryRecord[]>([]);
  loading = signal(false);
  expanded = signal<Set<number>>(new Set());

  ngOnInit() {
    this.loadHistory();
  }

  loadHistory() {
    this.loading.set(true);
    this.userApi.getHistory().subscribe({
      next: (res) => {
        this.records.set(res.history);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  getTransitions(status: string): ApplicationStatus[] {
    return TRANSITIONS[status as ApplicationStatus] || [];
  }

  getTransitionLabel(currentStatus: string, nextStatus: ApplicationStatus): string {
    if (nextStatus === 'created') return 'Reset status';
    return STATUS_CONFIG[nextStatus].label;
  }

  getTransitionButtonClass(next: ApplicationStatus): string {
    switch (next) {
      case 'applied': return 'text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100';
      case 'passed': return 'text-green-600 border-green-200 bg-green-50 hover:bg-green-100';
      case 'refused': return 'text-red-600 border-red-200 bg-red-50 hover:bg-red-100';
      case 'created': return 'text-gray-500 border-gray-200 bg-gray-50 hover:bg-gray-100';
    }
  }

  onTransition(record: CvHistoryRecord, next: ApplicationStatus) {
    record.status = next;
    this.userApi.updateHistoryStatus(record.documentId, next).subscribe();
  }

  toggleExpanded(createdAt: number) {
    const current = new Set(this.expanded());
    if (current.has(createdAt)) {
      current.delete(createdAt);
    } else {
      current.add(createdAt);
    }
    this.expanded.set(current);
  }

  isExpanded(createdAt: number): boolean {
    return this.expanded().has(createdAt);
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

  getRatingClass(rating: number): string {
    if (rating >= 8) return 'text-green-700 bg-green-50';
    if (rating >= 5) return 'text-yellow-700 bg-yellow-50';
    return 'text-red-700 bg-red-50';
  }
}
