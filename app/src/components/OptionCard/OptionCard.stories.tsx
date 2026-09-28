import type { Meta, StoryObj } from '@storybook/react-vite';
import { OptionCard } from './OptionCard';

const meta = { title: 'Components/OptionCard', component: OptionCard, args: { letter: 'A', selected: true, onChange: () => {}, option: { id: 'weekly', label: 'Weekly cadence, data first', tag: 'Closest to your syllabus', description: 'Weekly modules follow the sample syllabus schedule.', fits: [{ text: 'The source lists weekly topics.', span: { page: 4, text: 'Week 1: Asking statistical questions' } }], changes: 'Adds short retrieval checks.', tradeoffs: 'The instructor should check pacing.', evidence: 'Retrieval practice may help retention; course-specific effects are unknown.', frameworks: ['backward design'], modules: [{ title: 'Asking statistical questions', objective: 'Explain a statistical question.', outcomeIds: ['O1'], weeks: [1], lessons: 2, lessonMinutes: 20, assessment: 'Check', hours: 8 }], workload: { averageHours: 8, peakHours: 8, peakModule: 1 } } } } satisfies Meta<typeof OptionCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Selected: Story = {};
