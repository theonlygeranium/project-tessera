import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskCard } from './TaskCard';

const meta = { title: 'Components/TaskCard', component: TaskCard, args: { title: 'Reading charts', context: 'Data Literacy 101 · Module 1', minutes: 18, state: 'in-progress', href: '#lesson', actionLabel: 'Resume' } } satisfies Meta<typeof TaskCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ResumeInProgress: Story = {};
export const DueSoon: Story = { args: { title: 'Practice: compare two charts', state: 'todo', due: 'Due tomorrow', urgency: 'soon', actionLabel: 'Start' } };
export const Overdue: Story = { args: { title: 'Source check', state: 'todo', due: 'Due yesterday', urgency: 'overdue', actionLabel: 'Open' } };
export const Done: Story = { args: { title: 'Finding trustworthy sources', state: 'done', actionLabel: 'Review' } };
