import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { McpComponent } from '../app/components/dashboard/mcp.component';
import { UserApiService } from '../app/services/user-api.service';
import { of } from 'rxjs';

const meta: Meta<McpComponent> = {
  title: 'Dashboard/MCP',
  component: McpComponent,
  decorators: [
    moduleMetadata({
      providers: [
        { provide: UserApiService, useValue: { getConfig: () => of({ mcpUrl: 'https://mcp.promptcv.sallai.cc/mcp' }) } },
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<McpComponent>;

export const Default: Story = {};
