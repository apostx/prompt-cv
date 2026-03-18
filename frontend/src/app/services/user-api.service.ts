import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface DocValidation {
  valid: boolean;
  title?: string;
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

  getConfig(): Observable<{ mcpUrl: string }> {
    return this.http.get<{ mcpUrl: string }>(`${this.apiUrl}/config`);
  }
}
