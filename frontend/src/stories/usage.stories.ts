import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { UsageComponent } from '../app/components/dashboard/usage.component';
import { ActivatedRoute } from '@angular/router';

const meta: Meta<UsageComponent> = {
  title: 'Dashboard/Usage',
  component: UsageComponent,
  decorators: [
    moduleMetadata({
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: {} } },
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<UsageComponent>;

export const Default: Story = {};
