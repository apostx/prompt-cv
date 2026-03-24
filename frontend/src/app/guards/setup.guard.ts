import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

export const setupGuard: CanActivateFn = () => {
  const router = inject(Router);
  if (sessionStorage.getItem('mcpSetup') || sessionStorage.getItem('mcpSetupData')) return true;
  return router.createUrlTree(['/settings']);
};
