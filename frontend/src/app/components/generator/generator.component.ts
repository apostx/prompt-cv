import { Component, signal, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CvService, CvGenerateResponse } from '../../services/cv.service';

const TEMPLATE_DOC_ID_KEY = 'cv-template-doc-id';

@Component({
  selector: 'app-generator',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="max-w-4xl mx-auto p-6">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-bold text-gray-800">Prompt CV</h1>
        <a
          routerLink="/docs-html"
          class="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors">
          Docs HTML Writer
        </a>
      </div>

      <form (ngSubmit)="generate()" class="space-y-6">
        <div class="bg-white rounded-lg shadow-md p-6">
          <label class="block text-sm font-medium text-gray-700 mb-1">
            Template Google Doc ID
          </label>
          <p class="text-sm text-gray-500 mb-2">
            The Google Doc containing the Handlebars HTML template.
          </p>
          <input
            type="text"
            [(ngModel)]="templateDocId"
            name="templateDocId"
            placeholder="e.g. 1abc...xyz"
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            required>
        </div>

        <div class="bg-white rounded-lg shadow-md p-6">
          <label class="block text-sm font-medium text-gray-700 mb-1">
            CV Data (JSON)
          </label>
          <p class="text-sm text-gray-500 mb-2">
            JSON object with your CV context data. Must include header.name, application.position, and application.company.
          </p>
          <textarea
            [(ngModel)]="jsonData"
            name="jsonData"
            rows="20"
            placeholder='{ "header": { "name": "..." }, "application": { "position": "...", "company": "..." }, ... }'
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
            required></textarea>

          @if (jsonError()) {
            <p class="text-red-500 text-sm mt-1">{{ jsonError() }}</p>
          }
        </div>

        <div class="flex justify-end gap-4">
          <button
            type="submit"
            [disabled]="generating()"
            class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition-colors disabled:opacity-50">
            {{ generating() ? 'Generating...' : 'Generate CV' }}
          </button>
        </div>

        @if (error()) {
          <div class="text-red-600 text-sm text-center">{{ error() }}</div>
        }

        @if (result()) {
          <div class="bg-green-50 rounded-lg shadow-md p-6">
            <p class="text-green-700 font-semibold mb-2">
              {{ result()!.created ? 'CV created successfully!' : 'CV updated successfully!' }}
            </p>
            <p class="text-sm text-gray-600">
              Filename: <span class="font-mono">{{ result()!.filename }}</span>
            </p>
            <a
              [href]="'https://docs.google.com/document/d/' + result()!.documentId"
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
export class GeneratorComponent implements OnInit {
  private cvService = inject(CvService);

  templateDocId = '';
  jsonData = '';
  generating = signal(false);
  error = signal<string | null>(null);
  jsonError = signal<string | null>(null);
  result = signal<CvGenerateResponse | null>(null);

  ngOnInit(): void {
    const saved = localStorage.getItem(TEMPLATE_DOC_ID_KEY);
    if (saved) {
      this.templateDocId = saved;
    }
  }

  generate(): void {
    this.error.set(null);
    this.jsonError.set(null);
    this.result.set(null);

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(this.jsonData);
    } catch (e) {
      this.jsonError.set('Invalid JSON: ' + (e instanceof Error ? e.message : 'parse error'));
      return;
    }

    localStorage.setItem(TEMPLATE_DOC_ID_KEY, this.templateDocId);

    this.generating.set(true);

    this.cvService.generate({ data, templateDocId: this.templateDocId }).subscribe({
      next: (response) => {
        this.result.set(response);
        this.generating.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.error || err.message || 'Generation failed');
        this.generating.set(false);
      },
    });
  }

}
