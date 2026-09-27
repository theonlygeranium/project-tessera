import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChoiceGroup } from './ChoiceGroup';
function Controlled(props: React.ComponentProps<typeof ChoiceGroup>) {
  const [value, setValue] = useState(props.value);
  return <ChoiceGroup {...props} value={value} onChange={setValue} />;
}
const meta = { title: 'Components/ChoiceGroup', component: ChoiceGroup, args: { legend: 'Preferred study time', type: 'radio', name: 'study-time', options: [{ value: 'morning', label: 'Morning' }, { value: 'evening', label: 'Evening' }], value: 'morning', onChange: () => {} } } satisfies Meta<typeof ChoiceGroup>;
export default meta;
type Story = StoryObj<typeof meta>;
export const RadioPlain: Story = { render: (args) => <Controlled {...args} /> };
export const RadioCard: Story = { render: (args) => <Controlled {...args} />, args: { legend: 'Goal for Data Literacy 101', variant: 'card', name: 'goal', options: [{ value: 'degree', label: 'Complete my degree', description: 'Follow the course plan.' }, { value: 'explore', label: 'Explore a topic', description: 'Study at your own pace.' }], value: 'degree' } };
export const Checkbox: Story = { render: (args) => <Controlled {...args} />, args: { legend: 'When can you study?', type: 'checkbox', name: 'availability', options: [{ value: 'lunch', label: 'Lunch break' }, { value: 'weekend', label: 'Weekends' }], value: ['lunch'] } };
export const DisabledOption: Story = { render: (args) => <Controlled {...args} />, args: { options: [{ value: 'morning', label: 'Morning' }, { value: 'evening', label: 'Evening', disabled: true }], value: 'morning' } };
export const WithError: Story = { render: (args) => <Controlled {...args} />, args: { value: '', error: 'Choose a study time.' } };
