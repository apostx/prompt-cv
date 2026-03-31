import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { AdminHistoryComponent } from '../app/components/dashboard/admin-history.component';
import { UserApiService } from '../app/services/user-api.service';
import { of, delay } from 'rxjs';

const mockHistory = [
  {
    userId: 'user-1',
    createdAt: Date.now() - 2 * 60 * 60 * 1000,
    email: 'john.doe@gmail.com',
    documentId: 'doc1',
    documentUrl: '#',
    status: 'passed',
    stats: {
      jobTitle: 'Senior Frontend Engineer at Stripe',
      jobLink: 'https://stripe.com/jobs/1234',
      matchEvaluation:
        'Strong match on React/TypeScript experience. Payment systems background relevant. ' +
        'Could strengthen distributed systems experience.',
      rating: 8,
    },
  },
  {
    userId: 'user-2',
    createdAt: Date.now() - 5 * 60 * 60 * 1000,
    email: 'jane.smith@outlook.com',
    documentId: 'doc2',
    documentUrl: '#',
    status: 'applied',
    stats: {
      jobTitle: 'Tech Lead at Vercel',
      jobLink: 'https://vercel.com/careers/tech-lead',
      matchEvaluation:
        'Good technical fit. Leadership experience aligns. Gap: no serverless infrastructure at scale.',
      rating: 7,
    },
  },
  {
    userId: 'user-1',
    createdAt: Date.now() - 24 * 60 * 60 * 1000,
    email: 'john.doe@gmail.com',
    documentId: 'doc3',
    documentUrl: '#',
    status: 'refused',
    stats: {
      jobTitle: 'Staff Engineer at Google',
      matchEvaluation:
        'Technical skills strong but Google Staff requires demonstrated impact at 100M+ user scale.',
      rating: 5,
    },
  },
  {
    userId: 'user-3',
    createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
    email: 'alex.chen@company.com',
    documentId: 'doc4',
    documentUrl: '#',
    status: 'created',
    stats: {
      jobTitle: 'Engineering Manager at Linear',
      rating: 6,
    },
  },
];

const mockUserApi = {
  getAdminHistory: () => of({ history: mockHistory }),
};

const meta: Meta<AdminHistoryComponent> = {
  title: 'Dashboard/Admin History',
  component: AdminHistoryComponent,
  decorators: [
    moduleMetadata({
      providers: [{ provide: UserApiService, useValue: mockUserApi }],
    }),
  ],
};

export default meta;
type Story = StoryObj<AdminHistoryComponent>;

export const Default: Story = {};

export const Empty: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        { provide: UserApiService, useValue: { ...mockUserApi, getAdminHistory: () => of({ history: [] }) } },
      ],
    }),
  ],
};

export const Loading: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        { provide: UserApiService, useValue: { ...mockUserApi, getAdminHistory: () => of({ history: [] }).pipe(delay(999999)) } },
      ],
    }),
  ],
};
