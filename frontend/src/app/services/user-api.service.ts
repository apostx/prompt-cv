import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface DocValidation {
  valid: boolean;
  title?: string;
  path?: string;
  error?: string;
}

export interface SettingsValidation {
  [key: string]: DocValidation;
}

export interface UserSettings {
  folderPath?: string;
  contextDocId?: string;
  instructionsDocId?: string;
  templateDocId?: string;
  initialized?: boolean;
}

export interface SetupCheckResult {
  folderId?: string;
  files: {
    contextDocId?: string;
    instructionsDocId?: string;
    templateDocId?: string;
    generatedFolderId?: string;
  };
}

export type SetupFieldValue = 'default' | { id: string };

export interface SetupInitRequest {
  folder: SetupFieldValue;
  context: SetupFieldValue;
  instructions: SetupFieldValue;
  template: SetupFieldValue;
}

export interface CvFile {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime: string;
  webViewLink: string;
}

@Injectable({ providedIn: 'root' })
export class UserApiService {
  private http = inject(HttpClient);
  private apiUrl = environment.authApiUrl;

  getSettings(): Observable<{ settings: UserSettings }> {
    return this.http.get<{ settings: UserSettings }>(`${this.apiUrl}/user/settings`);
  }

  updateSettings(settings: UserSettings): Observable<{ settings: UserSettings; validation?: SettingsValidation }> {
    return this.http.put<{ settings: UserSettings; validation?: SettingsValidation }>(`${this.apiUrl}/user/settings`, settings);
  }

  listFiles(): Observable<{ files: CvFile[] }> {
    return this.http.get<{ files: CvFile[] }>(`${this.apiUrl}/user/files`);
  }

  getPickerConfig(): Observable<{ accessToken: string; apiKey: string; appId: string }> {
    return this.http.get<{ accessToken: string; apiKey: string; appId: string }>(`${this.apiUrl}/user/picker-config`);
  }

  createDefaultDoc(type: 'instructions' | 'template' | 'context', folderId?: string, title?: string): Observable<{ documentId: string; title: string; url: string }> {
    return this.http.post<{ documentId: string; title: string; url: string }>(`${this.apiUrl}/user/docs/create`, { type, ...(folderId && { folderId }), ...(title && { title }) });
  }

  validateDoc(id: string): Observable<DocValidation> {
    return this.http.get<DocValidation>(`${this.apiUrl}/user/validate-doc`, { params: { id } });
  }

  resolveFolder(id: string): Observable<{ path?: string }> {
    return this.http.get<{ path?: string }>(`${this.apiUrl}/user/resolve-folder`, { params: { id } });
  }

  getMcpSetup(token: string): Observable<{ jwt: string; code: string; redirectUri: string; state: string }> {
    return this.http.get<{ jwt: string; code: string; redirectUri: string; state: string }>(`${this.apiUrl}/oauth/mcp-setup`, { params: { token } });
  }

  getSetupCheck(): Observable<SetupCheckResult> {
    return this.http.get<SetupCheckResult>(`${this.apiUrl}/user/setup-check`);
  }

  initSetup(config: SetupInitRequest): Observable<{ settings: UserSettings }> {
    return this.http.post<{ settings: UserSettings }>(`${this.apiUrl}/user/setup-init`, config);
  }

  getConfig(): Observable<{ mcpUrl: string }> {
    return this.http.get<{ mcpUrl: string }>(`${this.apiUrl}/config`);
  }

  getStats(): Observable<{ userCount: number; totalCvsGenerated: number }> {
    return this.http.get<{ userCount: number; totalCvsGenerated: number }>(`${this.apiUrl}/stats`);
  }

  getAdminUsers(): Observable<{ users: AdminUser[] }> {
    return this.http.get<{ users: AdminUser[] }>(`${this.apiUrl}/admin/users`);
  }
}

export interface AdminUser {
  email: string;
  name: string;
  cvsGenerated: number;
  createdAt: string;
}
