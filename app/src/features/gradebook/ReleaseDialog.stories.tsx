import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { GradebookRow, GradeChangeSet, Submission } from '../../../../shared/domain';
import { ReleaseDialog } from './ReleaseDialog';

const assignment = { id: 'draft', title: 'Project draft', points: 40 } as Parameters<typeof ReleaseDialog>[0]['assignments'][number];
const row = { student: { id: 'u-priya', name: 'Priya Natarajan', email: '' }, result: { percent: 88.1, letter: 'B+' } } as GradebookRow;
const submission = { id: 's-priya', studentId: 'u-priya', state: 'graded', grade: { feedback: 'Clear use of evidence.' }, student: row.student } as Submission & { student: GradebookRow['student'] };
const preview: GradeChangeSet = { kind: 'release', hash: 'preview-hash', unchanged: 11, letterChanges: 0, changes: [{ studentId: 'u-priya', name: 'Priya Natarajan', from: { percent: 88.1, letter: 'B+' }, to: { percent: 88.4, letter: 'B+' } }], notSent: [] };
function Scene({ drafts = false }: { drafts?: boolean }) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  client.setQueryData(['previewRelease', { assignmentId: 'draft' }], drafts ? { ...preview, notSent: [{ submissionId: 's-priya', studentId: 'u-priya', reason: 'ai-draft-not-reviewed' }] } : preview);
  client.setQueryData(['release-submissions', 'draft'], drafts ? [{ ...submission, feedbackDraft: { text: 'Review me' } }] : [submission]);
  return <QueryClientProvider client={client}><MemoryRouter><ReleaseDialog courseId="stat110-04" assignments={[assignment]} initialId="draft" rows={[row]} onClose={() => {}} /></MemoryRouter></QueryClientProvider>;
}
const meta = { title: 'Gradebook/ReleaseDialog', component: Scene } satisfies Meta<typeof Scene>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const DraftNotReviewed: Story = { args: { drafts: true } };
