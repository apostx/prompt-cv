import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';

interface UserInfo {
  sub: string;
  email: string;
  name: string;
  isAdmin?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'cv_auth_token';
  private tokenSignal = signal<string | null>(this.getStoredToken());

  isLoggedIn = computed(() => !!this.tokenSignal());

  userInfo = computed<UserInfo | null>(() => {
    const token = this.tokenSignal();
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return { sub: payload.sub, email: payload.email, name: payload.name, isAdmin: payload.isAdmin };
    } catch {
      return null;
    }
  });

  private router = inject(Router);

  login(): void {
    window.location.href = `${environment.authApiUrl}/auth/google`;
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    this.tokenSignal.set(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return this.tokenSignal();
  }

  handleCallback(): boolean {
    const hash = window.location.hash;
    const match = hash.match(/token=([^&]+)/);
    if (match) {
      const token = match[1];
      localStorage.setItem(this.TOKEN_KEY, token);
      this.tokenSignal.set(token);
      return true;
    }
    return false;
  }

  setToken(token: string): void {
    localStorage.setItem(this.TOKEN_KEY, token);
    this.tokenSignal.set(token);
  }

  private getStoredToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }
}
