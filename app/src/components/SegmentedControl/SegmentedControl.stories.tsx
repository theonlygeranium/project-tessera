import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SegmentedControl } from './SegmentedControl';
const modes = [{ value: 'off', label: 'Off' }, { value: 'hints', label: 'Hints' }, { value: 'explain', label: 'Explain' }, { value: 'open', label: 'Open' }];
function Controlled(props: React.ComponentProps<typeof SegmentedControl>) {
  const [value, setValue] = useState(props.value);
  return <SegmentedControl {...props} value={value} onChange={setValue} />;
}
const meta = { title: 'Components/SegmentedControl', component: SegmentedControl, args: { legend: 'Tutor mode for Data Literacy 101', name: 'tutor-mode', options: modes, value: 'hints', onChange: () => {} } } satisfies Meta<typeof SegmentedControl>;
export default meta;
type Story = StoryObj<typeof meta>;
export const TutorModes: Story = { render: (args) => <Controlled {...args} /> };
export const OpenLocked: Story = { render: (args) => <Controlled {...args} />, args: { options: [...modes.slice(0, 3), { value: 'open', label: 'Open', locked: "Your program doesn't allow Open on graded work" }] } };
export const CompactView: Story = { render: (args) => <Controlled {...args} />, args: { legend: 'Course view', name: 'course-view', density: 'compact', options: [{ value: 'list', label: 'List' }, { value: 'grid', label: 'Grid' }], value: 'list' } };
