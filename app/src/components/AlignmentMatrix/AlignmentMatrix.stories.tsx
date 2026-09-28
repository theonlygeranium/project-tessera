import type { Meta, StoryObj } from '@storybook/react-vite';
import { AlignmentMatrix } from './AlignmentMatrix';
const meta = { title: 'Components/AlignmentMatrix', component: AlignmentMatrix, args: { outcomes: [{ id: 'O1', text: 'Explain a statistical question.', span: null, origin: 'extracted' }, { id: 'O2', text: 'Design a study.', span: null, origin: 'extracted' }], assessments: [{ id: 'A1', title: 'Quiz', weightPercent: 20, dueAt: null, format: 'multiple choice', span: null }], alignment: [{ outcomeId: 'O1', assessmentId: 'A1', state: 'assessed' }, { outcomeId: 'O2', assessmentId: 'A1', state: 'verb-mismatch' }] } } satisfies Meta<typeof AlignmentMatrix>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Audit: Story = {};
