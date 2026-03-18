import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { UserApiService, type CvFile } from '../../services/user-api.service';

@Component({
  selector: 'app-files',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="bg-white rounded-lg shadow-sm p-6">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-semibold text-gray-800">Generated CVs</h3>
        <button
          (click)="loadFiles()"
          class="text-sm text-blue-600 hover:text-blue-700 cursor-pointer"
        >
          Refresh
        </button>
      </div>
      @if (loading()) {
        <p class="text-gray-500">Loading...</p>
      } @else if (files().length === 0) {
        <p class="text-gray-500">No CVs generated yet.</p>
      } @else {
        <div class="divide-y divide-gray-100">
          @for (file of files(); track file.id) {
            <div class="py-3 flex justify-between items-center">
              <div>
                <a
                  [href]="file.webViewLink"
                  target="_blank"
                  class="text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  {{ file.name }}
                </a>
                <p class="text-xs text-gray-400 mt-0.5">
                  Modified {{ file.modifiedTime | date:'medium' }}
                </p>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class FilesComponent implements OnInit {
  private userApi = inject(UserApiService);

  files = signal<CvFile[]>([]);
  loading = signal(false);

  ngOnInit() {
    this.loadFiles();
  }

  loadFiles() {
    this.loading.set(true);
    this.userApi.listFiles().subscribe({
      next: (res) => {
        this.files.set(res.files);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
