import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChangeSetTable } from './ChangeSetTable';
const base = { kind: 'setup' as const, letterChanges: 1, unchanged: 11, notSent: [], hash: 'demo', changes: [{ studentId: 'u-priya', name: 'Priya Natarajan', from: { percent: 88.1, letter: 'B+' }, to: { percent: 88.4, letter: 'B+' } }, { studentId: 'u-brooks', name: 'Hannah Brooks', from: { percent: 79.9, letter: 'C+' }, to: { percent: 80.1, letter: 'B-' } }] };
const meta = { title: 'Components/ChangeSetTable', component: ChangeSetTable, args: { changeSet: base } } satisfies Meta<typeof ChangeSetTable>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Changes: Story = {};
export const NoChanges: Story = { args: { changeSet: { ...base, changes: [], letterChanges: 0 } } };
