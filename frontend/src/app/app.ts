import { Component, inject } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div [class]="showHeader() ? 'min-h-screen bg-gray-100' : ''">
      @if (showHeader()) {
        <header class="bg-white shadow-sm">
          <div class="max-w-4xl mx-auto px-6 py-4">
            <h1 class="text-xl font-bold text-gray-800">Prompt CV</h1>
          </div>
        </header>
      }
      <main [class]="showHeader() ? '' : 'md:h-screen md:overflow-hidden'">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
})
export class App {
  private router = inject(Router);
  showHeader = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => !e.urlAfterRedirects.startsWith('/login') && !e.urlAfterRedirects.startsWith('/auth/callback')),
    ),
    { initialValue: !location.pathname.startsWith('/login') && !location.pathname.startsWith('/auth/callback') },
  );
}
