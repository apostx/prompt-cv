import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  template: `<div class="flex items-center justify-center min-h-[80vh]"><p class="text-gray-500">Signing in...</p></div>`,
})
export class AuthCallbackComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);

  ngOnInit() {
    const hash = window.location.hash;
    const mcpSetup = hash.match(/mcpSetup=([^&]+)/)?.[1];
    if (mcpSetup) {
      // MCP setup flow — JWT will be fetched from API by setup component
      sessionStorage.setItem('mcpSetup', mcpSetup);
      this.router.navigate(['/setup']);
    } else if (this.auth.handleCallback()) {
      this.router.navigate(['/']);
    } else {
      this.router.navigate(['/login']);
    }
  }
}
