import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { HistoryComponent } from '../app/components/dashboard/history.component';
import { UserApiService } from '../app/services/user-api.service';
import { of, delay } from 'rxjs';

const mockHistory = [
  {
    userId: '123',
    createdAt: Date.now() - 2 * 60 * 60 * 1000,
    email: 'john.doe@gmail.com',
    documentId: 'doc1',
    documentUrl: '#',
    status: 'passed',
    stats: {
      jobTitle: 'Senior Frontend Engineer at Stripe',
      jobLink: 'https://stripe.com/jobs/1234',
      matchEvaluation:
        'Strong match on React/TypeScript experience (8+ years). Angular background translates well. ' +
        'Payment systems experience from previous role at PayPal is directly relevant. ' +
        'Could strengthen: distributed systems experience is light, but Stripe values strong product engineers.',
      rating: 8,
    },
  },
  {
    userId: '123',
    createdAt: Date.now() - 24 * 60 * 60 * 1000,
    email: 'john.doe@gmail.com',
    documentId: 'doc2',
    documentUrl: '#',
    status: 'applied',
    stats: {
      jobTitle: 'Tech Lead at Vercel',
      jobDescription: 'Lead a team of 5-8 engineers building next-gen deployment infrastructure...',
      jobLink: 'https://vercel.com/careers/tech-lead',
      matchEvaluation:
        'Good fit for technical skills. Leadership experience from current role aligns well with tech lead expectations. ' +
        'Edge computing knowledge is a plus. Gap: no direct experience with serverless infrastructure at this scale.',
      rating: 7,
    },
  },
  {
    userId: '123',
    createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
    email: 'john.doe@gmail.com',
    documentId: 'doc3',
    documentUrl: '#',
    status: 'refused',
    stats: {
      jobTitle: 'Staff Engineer at Google',
      matchEvaluation:
        'Technical skills are strong but Google Staff requires demonstrated impact at scale (100M+ users). ' +
        'Current experience is primarily B2B SaaS with smaller user bases. System design skills are solid but ' +
        'need more distributed systems depth for this level.',
      rating: 5,
    },
  },
  {
    userId: '123',
    createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
    email: 'john.doe@gmail.com',
    documentId: 'doc4',
    documentUrl: '#',
    status: 'passed',
    stats: {
      jobTitle: 'Senior Full-Stack Developer at Notion',
      jobLink: 'https://notion.so/careers/senior-fullstack',
      matchEvaluation:
        'Excellent match. Full-stack experience with React + Node.js directly applicable. ' +
        'Real-time collaboration features built in previous role are highly relevant to Notion\'s core product.',
      rating: 9,
    },
  },
  {
    userId: '123',
    createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
    email: 'john.doe@gmail.com',
    documentId: 'doc5',
    documentUrl: '#',
    status: 'created',
    stats: {
      jobTitle: 'Engineering Manager at Linear',
      rating: 6,
    },
  },
];

const mockUserApi = {
  getHistory: () => of({ history: mockHistory }),
  updateHistoryStatus: () => of(undefined),
};

const meta: Meta<HistoryComponent> = {
  title: 'Dashboard/History',
  component: HistoryComponent,
  decorators: [
    moduleMetadata({
      providers: [{ provide: UserApiService, useValue: mockUserApi }],
    }),
  ],
};

export default meta;
type Story = StoryObj<HistoryComponent>;

export const Default: Story = {};

export const Empty: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        { provide: UserApiService, useValue: { ...mockUserApi, getHistory: () => of({ history: [] }) } },
      ],
    }),
  ],
};

export const Loading: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        { provide: UserApiService, useValue: { ...mockUserApi, getHistory: () => of({ history: [] }).pipe(delay(999999)) } },
      ],
    }),
  ],
};

export const SingleEntry: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        { provide: UserApiService, useValue: { ...mockUserApi, getHistory: () => of({ history: [mockHistory[0]] }) } },
      ],
    }),
  ],
};
