import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card } from './Card';

const meta = {
  title: 'Components/Card',
  component: Card,
  args: { children: 'Resume: Bias in model evaluation' },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { variant: 'default' } };
export const Quiet: Story = { args: { variant: 'quiet', children: 'Four review cards due this week' } };
export const Interactive: Story = {
  args: { variant: 'interactive', href: '#lesson', children: 'Resume: Bias in model evaluation' },
};
export const LearnerDensity: Story = { args: { density: 'learner' } };
export const CompactDensity: Story = { args: { density: 'compact', children: 'Review: Responsible AI' } };
