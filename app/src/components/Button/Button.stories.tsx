import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: { children: 'Continue lesson' },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { variant: 'primary' } };
export const Secondary: Story = { args: { variant: 'secondary', children: 'Explain differently' } };
export const Text: Story = { args: { variant: 'text', children: 'View all tasks' } };
export const Disabled: Story = { args: { variant: 'primary', disabled: true, children: 'Submit response' } };
export const WithIcon: Story = { args: { variant: 'secondary', icon: '＋', children: 'Add a note' } };
export const IconOnly: Story = { args: { iconOnly: true, icon: '＋', 'aria-label': 'Add a note', children: undefined } };
export const AsLink: Story = { args: { href: '#lesson', variant: 'primary', children: 'Resume lesson' } };
export const LearnerDensity: Story = { args: { density: 'learner', children: 'Show answer' } };
export const CompactDensity: Story = { args: { density: 'compact', children: 'Review recipients' } };
