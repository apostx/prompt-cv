import { Component, inject, signal, OnInit } from '@angular/core';
import { UserApiService, type AdminUser } from '../../services/user-api.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  template: `
    <div class="bg-white rounded-lg shadow-sm p-6">
      <h3 class="text-lg font-semibold text-gray-800 mb-4">Users</h3>
      @if (loading()) {
        <p class="text-sm text-gray-500">Loading...</p>
      } @else if (error()) {
        <div class="text-sm text-red-600 bg-red-50 rounded-lg p-3">{{ error() }}</div>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-200 text-left text-gray-500">
                <th class="pb-2 font-medium">Name</th>
                <th class="pb-2 font-medium">Email</th>
                <th class="pb-2 font-medium text-right">CVs</th>
                <th class="pb-2 font-medium text-right">Joined</th>
              </tr>
            </thead>
            <tbody>
              @for (user of users(); track user.email) {
                <tr class="border-b border-gray-100">
                  <td class="py-2 text-gray-800">{{ user.name }}</td>
                  <td class="py-2 text-gray-600">{{ user.email }}</td>
                  <td class="py-2 text-gray-800 text-right">{{ user.cvsGenerated }}</td>
                  <td class="py-2 text-gray-500 text-right">{{ formatDate(user.createdAt) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="mt-4 text-xs text-gray-400">
          {{ users().length }} {{ users().length === 1 ? 'user' : 'users' }} &middot;
          {{ totalCvs() }} {{ totalCvs() === 1 ? 'CV' : 'CVs' }} generated
        </p>
      }
    </div>
  `,
})
export class AdminComponent implements OnInit {
  private userApi = inject(UserApiService);

  users = signal<AdminUser[]>([]);
  loading = signal(true);
  error = signal('');
  totalCvs = signal(0);

  ngOnInit() {
    this.userApi.getAdminUsers().subscribe({
      next: (res) => {
        this.users.set(res.users);
        this.totalCvs.set(res.users.reduce((sum, u) => sum + u.cvsGenerated, 0));
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.status === 403 ? 'Admin access required.' : 'Failed to load users.');
        this.loading.set(false);
      },
    });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString();
  }
}
