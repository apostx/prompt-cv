import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-usage',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="space-y-6">
      <div class="bg-white rounded-lg shadow-sm p-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-2">What is Prompt CV?</h3>
        <p class="text-sm text-gray-600">
          Prompt CV is an AI-powered CV generator that uses Google Docs as Handlebars templates.
          You provide your professional information to an AI assistant (via MCP or the REST API),
          and it generates a polished CV document directly in your Google Drive.
        </p>
      </div>

      <div class="bg-white rounded-lg shadow-sm p-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-3">How It Works</h3>
        <div class="space-y-4 text-sm text-gray-600">
          <div>
            <h4 class="font-medium text-gray-700 mb-1">1. Templates</h4>
            <p class="mb-2">
              CV templates are Google Docs using
              <a href="https://handlebarsjs.com/" target="_blank" class="text-blue-500 hover:text-blue-600 underline">Handlebars</a>
              syntax. Placeholders are replaced with your actual data during generation.
              See the <a href="/defaults/schema.txt" target="_blank" class="text-blue-500 hover:text-blue-600 underline">default schema</a>
              for the expected data structure.
            </p>
            <div class="bg-gray-100 rounded-lg p-3 text-xs font-mono text-gray-700 space-y-1">
              <p>{{"{{header.name}}"}} &mdash; simple value</p>
              <p>{{"{{#each experience}}"}} ... {{"{{/each}}"}} &mdash; loop over arrays</p>
              <p>{{"{{#if summary}}"}} ... {{"{{/if}}"}} &mdash; conditional sections</p>
              <p>{{"{{#each skills}}"}} {{"{{category}}"}}: {{"{{items}}"}} {{"{{/each}}"}} &mdash; nested data</p>
            </div>
            <p class="mt-2">
              Design your CV layout and formatting in Google Docs, then insert these placeholders where the data should appear.
              The styling (fonts, spacing, colors) is preserved in the generated document.
            </p>
          </div>
          <div>
            <h4 class="font-medium text-gray-700 mb-1">2. Instructions</h4>
            <p>
              Instructions guide the AI on how to collect your information and structure it.
              Default instructions are provided, or you can create your own in Google Docs and
              set the Doc ID in <a routerLink="/settings" class="text-blue-500 hover:text-blue-600 underline">Settings</a>.
              View the <a href="/defaults/instructions.txt" target="_blank" class="text-blue-500 hover:text-blue-600 underline">default instructions</a>
              as a starting point.
            </p>
          </div>
          <div>
            <h4 class="font-medium text-gray-700 mb-1">3. Generation</h4>
            <p>
              The AI collects your details, fills in the template, and creates a new Google Doc
              in your Drive. You can then optimize it to fit within a target page count.
            </p>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow-sm p-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-3">MCP Integration</h3>
        <p class="text-sm text-gray-600 mb-3">
          Connect Prompt CV to Claude or other MCP-compatible AI assistants.
          The MCP server provides 5 tools:
        </p>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-200">
                <th class="text-left py-2 pr-4 font-medium text-gray-600">Tool</th>
                <th class="text-left py-2 font-medium text-gray-600">Description</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr>
                <td class="py-2 pr-4 font-mono text-gray-800">get_doc_content</td>
                <td class="py-2 text-gray-600">Retrieve plain text of Google Docs (single or batch)</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-gray-800">get_cv_instructions</td>
                <td class="py-2 text-gray-600">Start a CV session and receive the instructions prompt</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-gray-800">update_cv_data</td>
                <td class="py-2 text-gray-600">Incrementally add data to the session</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-gray-800">finalize_cv</td>
                <td class="py-2 text-gray-600">Generate the CV from accumulated data + template</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono text-gray-800">optimize_cv</td>
                <td class="py-2 text-gray-600">Adjust margins to fit within target page count</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-sm text-gray-600 mt-3">
          See the <a routerLink="/mcp" class="text-blue-500 hover:text-blue-600 underline">MCP tab</a>
          for the server URL and connection instructions.
        </p>
      </div>

      <div class="bg-white rounded-lg shadow-sm p-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-3">Getting Started</h3>
        <ol class="list-decimal list-inside space-y-2 text-sm text-gray-600">
          <li>
            <strong>Sign in</strong> with your Google account and grant Google Drive access
          </li>
          <li>
            <strong>Connect via MCP</strong> by adding the server URL in Claude
            (see <a routerLink="/mcp" class="text-blue-500 hover:text-blue-600 underline">MCP tab</a>),
            or use the <a routerLink="/api" class="text-blue-500 hover:text-blue-600 underline">REST API</a> directly
          </li>
          <li>
            <strong>Create a template</strong> (optional) &mdash; copy the
            <a href="/defaults/schema.txt" target="_blank" class="text-blue-500 hover:text-blue-600 underline">default schema</a>
            into a Google Doc and customize it with your preferred layout
          </li>
          <li>
            <strong>Configure settings</strong> (optional) &mdash; set your custom Instructions Doc ID
            and Template Doc ID in <a routerLink="/settings" class="text-blue-500 hover:text-blue-600 underline">Settings</a>
          </li>
          <li>
            <strong>Generate CVs</strong> &mdash; ask the AI to create a CV, and find
            your generated documents in <a routerLink="/files" class="text-blue-500 hover:text-blue-600 underline">Generated CVs</a>
          </li>
        </ol>
      </div>
    </div>
  `,
})
export class UsageComponent {}
