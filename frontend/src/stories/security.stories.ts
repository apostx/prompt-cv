import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { SecurityComponent } from '../app/components/dashboard/security.component';
import { AuthService } from '../app/services/auth.service';
import { HttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { of } from 'rxjs';

const mockAuth = {
  userInfo: signal({ sub: '123', email: 'john.doe@gmail.com', name: 'John Doe' }),
  logout: () => console.log('logout'),
};

const meta: Meta<SecurityComponent> = {
  title: 'Dashboard/Security',
  component: SecurityComponent,
  decorators: [
    moduleMetadata({
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: HttpClient, useValue: { post: () => of({}) } },
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<SecurityComponent>;

export const Default: Story = {};
