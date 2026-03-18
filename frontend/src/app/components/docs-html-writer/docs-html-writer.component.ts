import { Component, signal, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DocsService } from '../../services/docs.service';

const DOC_ID_KEY = 'docs-html-doc-id';

@Component({
  selector: 'app-docs-html-writer',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="max-w-4xl mx-auto p-6">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-bold text-gray-800">Docs HTML Writer</h1>
        <a
          routerLink="/"
          class="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors">
          Prompt CV
        </a>
      </div>

      <form (ngSubmit)="write()" class="space-y-6">
        <div class="bg-white rounded-lg shadow-md p-6">
          <label class="block text-sm font-medium text-gray-700 mb-1">
            Google Doc ID
          </label>
          <p class="text-sm text-gray-500 mb-2">
            The target Google Doc to overwrite with HTML content (with indentation fix).
          </p>
          <input
            type="text"
            [(ngModel)]="docId"
            name="docId"
            placeholder="e.g. 1abc...xyz"
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            required>
        </div>

        <div class="bg-white rounded-lg shadow-md p-6">
          <label class="block text-sm font-medium text-gray-700 mb-1">
            HTML Content
          </label>
          <p class="text-sm text-gray-500 mb-2">
            Paste the full HTML to write to the document. Indentation (margin-left) will be preserved.
          </p>
          <textarea
            [(ngModel)]="htmlContent"
            name="htmlContent"
            rows="20"
            placeholder="<html>...</html>"
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
            required></textarea>
        </div>

        <div class="flex justify-end gap-4">
          <button
            type="submit"
            [disabled]="writing()"
            class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition-colors disabled:opacity-50">
            {{ writing() ? 'Writing...' : 'Write HTML' }}
          </button>
        </div>

        @if (error()) {
          <div class="text-red-600 text-sm text-center">{{ error() }}</div>
        }

        @if (success()) {
          <div class="bg-green-50 rounded-lg shadow-md p-6">
            <p class="text-green-700 font-semibold mb-2">Document updated successfully!</p>
            <a
              [href]="'https://docs.google.com/document/d/' + docId"
              target="_blank"
              class="inline-block mt-2 text-blue-600 hover:underline">
              Open in Google Docs
            </a>
          </div>
        }
      </form>
    </div>
  `,
})
export class DocsHtmlWriterComponent implements OnInit {
  private docsService = inject(DocsService);

  docId = '';
  htmlContent = '';
  writing = signal(false);
  error = signal<string | null>(null);
  success = signal(false);

  ngOnInit(): void {
    const saved = localStorage.getItem(DOC_ID_KEY);
    if (saved) {
      this.docId = saved;
    }
  }

  write(): void {
    this.error.set(null);
    this.success.set(false);

    localStorage.setItem(DOC_ID_KEY, this.docId);

    this.writing.set(true);

    this.docsService.writeHtml(this.docId, this.htmlContent).subscribe({
      next: () => {
        this.success.set(true);
        this.writing.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.error || err.message || 'Write failed');
        this.writing.set(false);
      },
    });
  }

}
