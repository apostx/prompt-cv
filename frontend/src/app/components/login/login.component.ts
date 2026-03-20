import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { UserApiService } from '../../services/user-api.service';

@Component({
  selector: 'app-login',
  standalone: true,
  template: `
    <div class="flex flex-col items-center justify-center min-h-[80vh]">
      <div class="bg-white rounded-lg shadow-md p-8 max-w-sm w-full text-center">
        <h2 class="text-2xl font-bold text-gray-800 mb-2">Prompt CV</h2>
        <p class="text-gray-500 mb-6">Sign in to manage your CVs</p>
        @if (error()) {
          <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
            {{ error() }}
          </div>
        }
        <button
          (click)="auth.login()"
          class="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 rounded-lg px-4 py-3 text-gray-700 font-medium hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google
        </button>
      </div>
      @if (userCount() > 0) {
        <div class="mt-6 flex items-center gap-4 text-sm text-gray-400">
          <div class="flex items-center gap-1.5">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
            <span>{{ userCount() }} {{ userCount() === 1 ? 'user' : 'users' }}</span>
          </div>
          <span class="text-gray-300">|</span>
          <div class="flex items-center gap-1.5">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <span>{{ totalCvs() }} {{ totalCvs() === 1 ? 'CV' : 'CVs' }} generated</span>
          </div>
        </div>
      }
    </div>
  `,
})
export class LoginComponent implements OnInit {
  auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private userApi = inject(UserApiService);
  error = signal('');
  userCount = signal(0);
  totalCvs = signal(0);

  ngOnInit() {
    const errorParam = this.route.snapshot.queryParamMap.get('error');
    if (errorParam === 'missing_scopes') {
      this.error.set('Google Drive file access is required so Prompt CV can save generated CVs to your Drive. Please try again and grant the requested permission.');
    }

    this.userApi.getStats().subscribe({
      next: (stats) => {
        this.userCount.set(stats.userCount);
        this.totalCvs.set(stats.totalCvsGenerated);
      },
    });
  }
}
