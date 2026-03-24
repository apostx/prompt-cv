import type { Meta, StoryObj } from '@storybook/angular';
import { ApiComponent } from '../app/components/dashboard/api.component';

const meta: Meta<ApiComponent> = {
  title: 'Dashboard/API',
  component: ApiComponent,
};

export default meta;
type Story = StoryObj<ApiComponent>;

export const Default: Story = {};
