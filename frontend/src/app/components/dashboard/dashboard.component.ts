import { Component, inject, computed } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="max-w-4xl mx-auto px-6 py-6">
      <div class="flex justify-between items-center mb-6">
        <p class="text-gray-600">{{ auth.userInfo()?.email }}</p>
        <button
          (click)="auth.logout()"
          class="text-sm text-gray-500 hover:text-gray-700 cursor-pointer"
        >
          Sign out
        </button>
      </div>

      <!-- Tabs -->
      <div class="border-b border-gray-200 mb-6">
        <nav class="flex gap-6">
          @for (tab of visibleTabs(); track tab.path) {
            <a
              [routerLink]="tab.path"
              routerLinkActive="border-blue-500 text-blue-600"
              [routerLinkActiveOptions]="{ exact: tab.path === '/settings' }"
              class="pb-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 transition-colors"
            >
              {{ tab.label }}
            </a>
          }
        </nav>
      </div>

      <router-outlet />
    </div>
  `,
})
export class DashboardComponent {
  auth = inject(AuthService);

  private tabs = [
    { path: '/settings', label: 'Settings' },
    { path: '/files', label: 'Generated CVs' },
    { path: '/mcp', label: 'MCP' },
    { path: '/api', label: 'API' },
    { path: '/usage', label: 'Usage' },
    { path: '/security', label: 'Security' },
    { path: '/admin', label: 'Admin', admin: true },
  ];

  visibleTabs = computed(() =>
    this.tabs.filter((tab) => !tab.admin || this.auth.userInfo()?.isAdmin),
  );
}
