import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { UserApiService } from './user-api.service';

@Injectable({ providedIn: 'root' })
export class GooglePickerService {
  private userApi = inject(UserApiService);
  private gapiLoaded = false;
  private pickerLoaded = false;

  private loadGapi(): Promise<void> {
    if (this.gapiLoaded) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        this.gapiLoaded = true;
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load Google API'));
      document.head.appendChild(script);
    });
  }

  private loadPicker(): Promise<void> {
    if (this.pickerLoaded) return Promise.resolve();
    return new Promise((resolve, reject) => {
      gapi.load('picker', {
        callback: () => {
          this.pickerLoaded = true;
          resolve();
        },
        onerror: () => reject(new Error('Failed to load Picker')),
      });
    });
  }

  pickDocument(): Observable<{ id: string; name: string } | null> {
    return new Observable(subscriber => {
      this.openPicker('document')
        .then(result => {
          subscriber.next(result);
          subscriber.complete();
        })
        .catch(err => subscriber.error(err));
    });
  }

  pickFolder(): Observable<{ id: string; name: string } | null> {
    return new Observable(subscriber => {
      this.openPicker('folder')
        .then(result => {
          subscriber.next(result);
          subscriber.complete();
        })
        .catch(err => subscriber.error(err));
    });
  }

  private async openPicker(mode: 'document' | 'folder'): Promise<{ id: string; name: string } | null> {
    await this.loadGapi();
    await this.loadPicker();

    const config = await firstValueFrom(this.userApi.getPickerConfig());

    return new Promise(resolve => {
      let view: google.picker.DocsView;
      if (mode === 'folder') {
        view = new google.picker.DocsView(google.picker.ViewId.FOLDERS);
        view.setMimeTypes('application/vnd.google-apps.folder');
        view.setSelectFolderEnabled(true);
      } else {
        view = new google.picker.DocsView(google.picker.ViewId.DOCUMENTS);
        view.setMimeTypes('application/vnd.google-apps.document');
        view.setIncludeFolders(true);
      }

      const picker = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(config.accessToken)
        .setDeveloperKey(config.apiKey)
        .setAppId(config.appId)
        .setCallback((data: google.picker.ResponseObject) => {
          if (data.action === google.picker.Action.PICKED) {
            const doc = data.docs[0];
            resolve({ id: doc.id, name: doc.name });
          } else if (data.action === google.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build();

      picker.setVisible(true);
    });
  }
}
