import type { Meta, StoryObj } from '@storybook/react-vite';
import { StateLabel, stateWords, type GradeState } from './StateLabel';
const states = Object.keys(stateWords) as GradeState[];
const meta = { title: 'Components/StateLabel', component: StateLabel, args: { state: 'late' } } satisfies Meta<typeof StateLabel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AllStates: Story = { render: () => <div style={{ display: 'grid', gap: 12 }}>{states.map(state => <StateLabel key={state} state={state} />)}</div> };
export const Late: Story = { args: { state: 'late', label: 'late 2 days' } };
export const FeedbackDraft: Story = { args: { state: 'feedback-draft' } };
