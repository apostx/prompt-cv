import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class DocsService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  writeHtml(docId: string, html: string): Observable<{ success: boolean; documentId: string }> {
    return this.http.put<{ success: boolean; documentId: string }>(
      `${this.apiUrl}/docs/${docId}/html`,
      { content: html }
    );
  }
}
