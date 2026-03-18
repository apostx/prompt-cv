import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CvGenerateRequest {
  data: Record<string, unknown>;
  templateDocId: string;
}

export interface CvGenerateResponse {
  documentId: string;
  title: string;
  filename: string;
  created: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class CvService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  generate(request: CvGenerateRequest): Observable<CvGenerateResponse> {
    return this.http.post<CvGenerateResponse>(`${this.apiUrl}/cv/generate`, request);
  }
}
