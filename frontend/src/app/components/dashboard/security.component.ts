import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-security',
  standalone: true,
  template: `
    <div class="space-y-6">
      <!-- Connected Account -->
      <div class="bg-white rounded-lg shadow-sm p-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-4">Google Account</h3>
        <p class="text-sm text-gray-600">
          Signed in as <span class="font-medium text-gray-800">{{ auth.userInfo()?.email }}</span>
        </p>
      </div>

      <!-- Granted Permissions -->
      <div class="bg-white rounded-lg shadow-sm p-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-4">Granted Permissions</h3>
        <ul class="space-y-3 text-sm text-gray-600">
          <li class="flex items-start gap-2">
            <span class="text-green-500 mt-0.5">&#10003;</span>
            <div>
              <p class="font-medium text-gray-700">Create and edit files it creates in your Drive</p>
              <p class="text-gray-500">Required &mdash; used to save generated CVs to your Google Drive</p>
            </div>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-green-500 mt-0.5">&#10003;</span>
            <div>
              <p class="font-medium text-gray-700">View your basic profile info</p>
              <p class="text-gray-500">Name and email for account identification</p>
            </div>
          </li>
        </ul>
      </div>

      <!-- Manage Permissions -->
      <div class="bg-white rounded-lg shadow-sm p-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-4">Manage Permissions</h3>
        <p class="text-sm text-gray-600 mb-3">
          You can review and revoke app permissions from your Google Account settings.
        </p>
        <a
          href="https://myaccount.google.com/permissions"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-block text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          Open Google Account Permissions &rarr;
        </a>
        <div class="mt-3 bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
          If this app is not listed on Google's permissions page, this is normal for apps in testing
          mode. The permissions were still granted &mdash; you can use the disconnect button below to
          revoke them.
        </div>
      </div>

      <!-- Disconnect -->
      <div class="bg-white rounded-lg shadow-sm p-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-4">Disconnect Google Account</h3>
        <p class="text-sm text-gray-600 mb-4">
          This will revoke all Google permissions granted to Prompt CV and sign you out. You can sign
          in again at any time.
        </p>
        @if (error()) {
          <div class="mb-3 text-sm text-red-600 bg-red-50 rounded-lg p-3">{{ error() }}</div>
        }
        <button
          (click)="disconnect()"
          [disabled]="revoking()"
          class="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {{ revoking() ? 'Disconnecting...' : 'Disconnect' }}
        </button>
      </div>
    </div>
  `,
})
export class SecurityComponent {
  auth = inject(AuthService);
  private http = inject(HttpClient);

  revoking = signal(false);
  error = signal('');

  disconnect() {
    this.revoking.set(true);
    this.error.set('');

    this.http.post(`${environment.authApiUrl}/auth/revoke`, {}).subscribe({
      next: () => this.auth.logout(),
      error: () => {
        this.revoking.set(false);
        this.error.set('Failed to revoke permissions. Please try again or revoke manually via Google Account settings.');
      },
    });
  }
}
