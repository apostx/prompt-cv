import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { AdminComponent } from '../app/components/dashboard/admin.component';
import { UserApiService } from '../app/services/user-api.service';
import { of, throwError, delay } from 'rxjs';

const mockUsers = [
  { email: 'john.doe@gmail.com', name: 'John Doe', cvsGenerated: 15, createdAt: '2026-01-10T12:00:00Z' },
  { email: 'jane.smith@gmail.com', name: 'Jane Smith', cvsGenerated: 8, createdAt: '2026-02-05T09:30:00Z' },
  { email: 'bob.wilson@gmail.com', name: 'Bob Wilson', cvsGenerated: 3, createdAt: '2026-03-01T16:00:00Z' },
];

const meta: Meta<AdminComponent> = {
  title: 'Dashboard/Admin',
  component: AdminComponent,
  decorators: [
    moduleMetadata({
      providers: [
        { provide: UserApiService, useValue: { getAdminUsers: () => of({ users: mockUsers }) } },
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<AdminComponent>;

export const WithUsers: Story = {};

export const AccessDenied: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        { provide: UserApiService, useValue: { getAdminUsers: () => throwError(() => ({ status: 403 })) } },
      ],
    }),
  ],
};

export const Loading: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        { provide: UserApiService, useValue: { getAdminUsers: () => of({ users: [] }).pipe(delay(999999)) } },
      ],
    }),
  ],
};
