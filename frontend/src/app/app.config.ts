import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, Routes } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authGuard } from './guards/auth.guard';
import { authInterceptor } from './interceptors/auth.interceptor';
import { LoginComponent } from './components/login/login.component';
import { AuthCallbackComponent } from './components/auth-callback/auth-callback.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { SettingsComponent } from './components/dashboard/settings.component';
import { FilesComponent } from './components/dashboard/files.component';
import { McpComponent } from './components/dashboard/mcp.component';
import { ApiComponent } from './components/dashboard/api.component';
import { UsageComponent } from './components/dashboard/usage.component';

const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'auth/callback', component: AuthCallbackComponent },
  {
    path: '',
    component: DashboardComponent,
    canActivate: [authGuard],
    children: [
      { path: 'settings', component: SettingsComponent },
      { path: 'files', component: FilesComponent },
      { path: 'mcp', component: McpComponent },
      { path: 'api', component: ApiComponent },
      { path: 'usage', component: UsageComponent },
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
