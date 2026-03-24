import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { FilesComponent } from '../app/components/dashboard/files.component';
import { UserApiService } from '../app/services/user-api.service';
import { of, delay } from 'rxjs';

const mockFiles = [
  {
    id: '1',
    name: 'john_doe_senior_frontend_engineer_acme_corp',
    createdTime: '2026-03-20T10:00:00Z',
    modifiedTime: '2026-03-20T10:30:00Z',
    webViewLink: '#',
  },
  {
    id: '2',
    name: 'john_doe_tech_lead_startup_inc',
    createdTime: '2026-03-18T14:00:00Z',
    modifiedTime: '2026-03-18T14:15:00Z',
    webViewLink: '#',
  },
  {
    id: '3',
    name: 'john_doe_fullstack_developer_bigtech',
    createdTime: '2026-03-15T09:00:00Z',
    modifiedTime: '2026-03-15T09:45:00Z',
    webViewLink: '#',
  },
];

const meta: Meta<FilesComponent> = {
  title: 'Dashboard/Files',
  component: FilesComponent,
  decorators: [
    moduleMetadata({
      providers: [
        { provide: UserApiService, useValue: { listFiles: () => of({ files: mockFiles }) } },
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<FilesComponent>;

export const WithFiles: Story = {};

export const Empty: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        { provide: UserApiService, useValue: { listFiles: () => of({ files: [] }) } },
      ],
    }),
  ],
};

export const Loading: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        { provide: UserApiService, useValue: { listFiles: () => of({ files: [] }).pipe(delay(999999)) } },
      ],
    }),
  ],
};
