import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { LoginComponent } from '../app/components/login/login.component';
import { AuthService } from '../app/services/auth.service';
import { UserApiService } from '../app/services/user-api.service';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';

const mockAuthService = { login: () => console.log('login clicked') };
const mockRoute = { snapshot: { queryParamMap: { get: () => null } } };
const mockUserApi = {
  getStats: () => of({ userCount: 12, totalCvsGenerated: 47 }),
  getConfig: () => of({ mcpUrl: 'https://mcp.promptcv.sallai.cc/mcp' }),
};

const meta: Meta<LoginComponent> = {
  title: 'Pages/Login',
  component: LoginComponent,
  decorators: [
    moduleMetadata({
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: UserApiService, useValue: mockUserApi },
      ],
    }),
  ],
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<LoginComponent>;

export const Default: Story = {};

export const WithError: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (key: string) => key === 'error' ? 'missing_scopes' : null } } } },
      ],
    }),
  ],
};

export const WithStats: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        {
          provide: UserApiService,
          useValue: {
            getStats: () => of({ userCount: 238, totalCvsGenerated: 1547 }),
            getConfig: () => of({ mcpUrl: 'https://mcp.promptcv.sallai.cc/mcp' }),
          },
        },
      ],
    }),
  ],
};
