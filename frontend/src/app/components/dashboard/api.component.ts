import { Component } from '@angular/core';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-api',
  standalone: true,
  template: `
    <div class="space-y-6">
      <div class="bg-white rounded-lg shadow-sm p-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-4">REST API</h3>
        <p class="text-sm text-gray-600 mb-4">
          Use the REST API to generate and manage CVs programmatically.
          All endpoints require a Bearer token in the Authorization header.
        </p>

        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
          <code class="block bg-gray-100 rounded-lg px-3 py-2 text-sm font-mono text-gray-800 break-all">{{ baseUrl }}</code>
        </div>

        <div class="mb-4">
          <h4 class="text-sm font-semibold text-gray-700 mb-2">Authentication</h4>
          <p class="text-sm text-gray-600">
            Include your JWT token (from web login) or MCP access token in every request:
          </p>
          <pre class="bg-gray-800 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto mt-2">Authorization: Bearer &lt;your-token&gt;</pre>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow-sm p-6">
        <h4 class="text-sm font-semibold text-gray-700 mb-3">Endpoints</h4>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-200">
                <th class="text-left py-2 pr-4 font-medium text-gray-600">Method</th>
                <th class="text-left py-2 pr-4 font-medium text-gray-600">Path</th>
                <th class="text-left py-2 font-medium text-gray-600">Description</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr>
                <td class="py-2 pr-4"><span class="text-green-600 font-mono">GET</span></td>
                <td class="py-2 pr-4 font-mono text-gray-800">/user/settings</td>
                <td class="py-2 text-gray-600">Get your current settings</td>
              </tr>
              <tr>
                <td class="py-2 pr-4"><span class="text-blue-600 font-mono">PUT</span></td>
                <td class="py-2 pr-4 font-mono text-gray-800">/user/settings</td>
                <td class="py-2 text-gray-600">Update settings (folderPath, contextDocId, instructionsDocId, templateDocId)</td>
              </tr>
              <tr>
                <td class="py-2 pr-4"><span class="text-green-600 font-mono">GET</span></td>
                <td class="py-2 pr-4 font-mono text-gray-800">/user/files</td>
                <td class="py-2 text-gray-600">List your generated CV files</td>
              </tr>
              <tr>
                <td class="py-2 pr-4"><span class="text-orange-600 font-mono">POST</span></td>
                <td class="py-2 pr-4 font-mono text-gray-800">/cv/generate</td>
                <td class="py-2 text-gray-600">Generate a CV from template + data</td>
              </tr>
              <tr>
                <td class="py-2 pr-4"><span class="text-orange-600 font-mono">POST</span></td>
                <td class="py-2 pr-4 font-mono text-gray-800">/cv/optimize</td>
                <td class="py-2 text-gray-600">Optimize a CV to fit within target pages</td>
              </tr>
              <tr>
                <td class="py-2 pr-4"><span class="text-blue-600 font-mono">PUT</span></td>
                <td class="py-2 pr-4 font-mono text-gray-800">/docs/:id/html</td>
                <td class="py-2 text-gray-600">Update a Google Doc with HTML content</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow-sm p-6">
        <h4 class="text-sm font-semibold text-gray-700 mb-3">Examples</h4>

        <div class="space-y-4">
          @for (example of examples; track example.title) {
            <div>
              <p class="text-sm font-medium text-gray-700 mb-1">{{ example.title }}</p>
              <pre class="bg-gray-800 text-green-400 rounded-lg p-4 text-sm font-mono overflow-x-auto" [textContent]="example.code"></pre>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class ApiComponent {
  baseUrl = environment.authApiUrl;

  examples = [
    {
      title: 'Generate a CV',
      code: `curl -X POST ${this.baseUrl}/cv/generate \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d @data.json

# data.json
{
  "templateDocId": "YOUR_TEMPLATE_DOC_ID",
  "data": {
    "header": { "name": "Jane Smith", "email": "jane@example.com" },
    "summary": "Experienced software engineer...",
    "experience": [...],
    "education": [...],
    "skills": [...]
  }
}`,
    },
    {
      title: 'Optimize a CV',
      code: `curl -X POST ${this.baseUrl}/cv/optimize \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "documentId": "DOC_ID", "targetPages": 2 }'`,
    },
    {
      title: 'Update settings',
      code: `curl -X PUT ${this.baseUrl}/user/settings \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "folderPath": "cv/generated",
    "contextDocId": "YOUR_CONTEXT_DOC_ID",
    "instructionsDocId": "YOUR_INSTRUCTIONS_DOC_ID",
    "templateDocId": "YOUR_TEMPLATE_DOC_ID"
  }'`,
    },
  ];
}
