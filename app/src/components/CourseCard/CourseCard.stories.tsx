import type { Meta, StoryObj } from '@storybook/react-vite';
import { CourseCard } from './CourseCard';

const meta = { title: 'Components/CourseCard', component: CourseCard, args: { title: 'Data Literacy 101', code: 'DATA 101', term: 'Fall 2026', instructor: 'Dr. Okafor', status: 'active', progress: .4, href: '#data-literacy' } } satisfies Meta<typeof CourseCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const StudentActive: Story = {};
export const NotStarted: Story = { args: { title: 'Research Methods', code: 'RES 102', status: 'not-started', progress: 0, href: '#research' } };
export const Completed: Story = { args: { title: 'Introduction to Statistics', code: 'STAT 100', status: 'completed', progress: 1, href: '#statistics' } };
export const InstructorDraft: Story = { args: { title: 'Data Literacy 101', status: 'draft', progress: undefined, instructor: undefined, meta: '12 students · 3 modules' } };
