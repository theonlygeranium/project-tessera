import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorkloadChart } from './WorkloadChart';
const meta = { title: 'Components/WorkloadChart', component: WorkloadChart, args: { estimate: { weeklyBudgetHours: 9, averageHours: 7.2, weeks: [{ week: 1, hours: 7, overBudget: false, drivers: ['reading'] }, { week: 2, hours: 12, overBudget: true, drivers: ['project'] }], rates: { readingPagesPerHour: 34, problemSetHours: 2, writingHoursPerPage: 1, projectHours: 30, quizMinutes: 20, discussionMinutes: 45 }, assumptions: ['30 pages per chapter.'] } } } satisfies Meta<typeof WorkloadChart>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Weekly: Story = {};
