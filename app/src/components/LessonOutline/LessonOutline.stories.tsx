import type { Meta, StoryObj } from '@storybook/react-vite';
import { LessonOutline } from './LessonOutline';

const meta = { title: 'Components/LessonOutline', component: LessonOutline, args: { mode: 'student', currentLessonId: 'charts', modules: [
  { id: 'm1', title: 'Module 1 · Reading data', lessons: [
    { id: 'sources', title: 'Finding trustworthy sources', minutes: 12, state: 'done' },
    { id: 'charts', title: 'Reading charts', minutes: 18, state: 'current', href: '#charts' },
    { id: 'questions', title: 'Ask better questions', minutes: 15, state: 'todo', href: '#questions' },
  ] },
  { id: 'm2', title: 'Module 2 · Making claims', lessons: [{ id: 'claims', title: 'Claims and evidence', minutes: 20, state: 'todo', href: '#claims' }] },
] } } satisfies Meta<typeof LessonOutline>;
export default meta;
type Story = StoryObj<typeof meta>;
export const StudentProgress: Story = {};
export const Author: Story = { args: { mode: 'author', currentLessonId: undefined, onMoveLesson: () => {}, onMoveModule: () => {}, modules: [
  { id: 'm1', title: 'Module 1 · Reading data', lessons: [{ id: 'sources', title: 'Finding trustworthy sources', status: 'Published' }, { id: 'charts', title: 'Reading charts', status: 'Draft' }] },
  { id: 'm2', title: 'Module 2 · Making claims', lessons: [{ id: 'claims', title: 'Claims and evidence', status: 'Draft' }] },
] } };
export const EmptyModule: Story = { args: { mode: 'author', currentLessonId: undefined, modules: [{ id: 'm3', title: 'Module 3 · Practice', lessons: [] }] } };
