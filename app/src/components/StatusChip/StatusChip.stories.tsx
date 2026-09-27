import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusChip } from './StatusChip';

const meta = {
  title: 'Components/StatusChip',
  component: StatusChip,
  args: { tone: 'neutral', children: 'Not started' },
} satisfies Meta<typeof StatusChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = { args: { tone: 'neutral', children: 'Not started' } };
export const Accent: Story = { args: { tone: 'accent', children: 'In progress' } };
export const Ai: Story = { args: { tone: 'ai', children: 'Tutor: hint mode' } };
export const Success: Story = { args: { tone: 'success', children: 'Completed' } };
export const Warning: Story = { args: { tone: 'warning', children: 'Due tomorrow' } };
export const Error: Story = { args: { tone: 'error', children: 'Overdue' } };
export const WithIcon: Story = { args: { tone: 'warning', icon: '!', children: 'Due tomorrow' } };
