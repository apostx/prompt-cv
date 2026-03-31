import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, Routes } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authGuard } from './guards/auth.guard';
import { guestGuard } from './guards/guest.guard';
import { authInterceptor } from './interceptors/auth.interceptor';
import { LoginComponent } from './components/login/login.component';
import { AuthCallbackComponent } from './components/auth-callback/auth-callback.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { SettingsComponent } from './components/dashboard/settings.component';
import { FilesComponent } from './components/dashboard/files.component';
import { McpComponent } from './components/dashboard/mcp.component';
import { ApiComponent } from './components/dashboard/api.component';
import { UsageComponent } from './components/dashboard/usage.component';
import { SecurityComponent } from './components/dashboard/security.component';
import { AdminComponent } from './components/dashboard/admin.component';
import { HistoryComponent } from './components/dashboard/history.component';
import { AdminHistoryComponent } from './components/dashboard/admin-history.component';
import { AdminConfigComponent } from './components/dashboard/admin-config.component';
import { SetupComponent } from './components/dashboard/setup.component';
import { setupGuard } from './guards/setup.guard';

const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  { path: 'auth/callback', component: AuthCallbackComponent },
  { path: 'setup', component: SetupComponent, canActivate: [setupGuard] },
  {
    path: '',
    component: DashboardComponent,
    canActivate: [authGuard],
    children: [
      { path: 'settings', component: SettingsComponent },
      { path: 'files', component: FilesComponent },
      { path: 'history', component: HistoryComponent },
      { path: 'mcp', component: McpComponent },
      { path: 'api', component: ApiComponent },
      { path: 'usage', component: UsageComponent },
      { path: 'security', component: SecurityComponent },
      { path: 'admin', component: AdminComponent },
      { path: 'admin-history', component: AdminHistoryComponent },
      { path: 'admin-config', component: AdminConfigComponent },
      { path: '', redirectTo: 'settings', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: '' },
];

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};
