import type { Meta, StoryObj } from '@storybook/react-vite';
import { FormField, Select, TextArea, TextInput } from './FormField';

const meta = { title: 'Components/FormField', component: FormField, args: { label: 'Course title', children: (control) => <TextInput {...control} placeholder="Data Literacy 101" /> } } satisfies Meta<typeof FormField>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Text: Story = {};
export const WithHint: Story = { args: { label: 'Email address', hint: 'Use your Meridian State email.', children: (control) => <TextInput {...control} type="email" /> } };
export const WithError: Story = { args: { label: 'Course title', error: 'Enter a course title.', children: (control) => <TextInput {...control} /> } };
export const Required: Story = { args: { label: 'Course title', required: true } };
export const Textarea: Story = { args: { label: 'Course description', children: (control) => <TextArea {...control} defaultValue="An introduction to evidence-based decisions." /> } };
export const NativeSelect: Story = { args: { label: 'Course level', children: (control) => <Select {...control} defaultValue=""><option value="">Choose a level</option><option value="intro">Introductory</option><option value="advanced">Advanced</option></Select> } };
export const Disabled: Story = { args: { label: 'Course code', children: (control) => <TextInput {...control} disabled value="DL101" readOnly /> } };
export const ReadOnly: Story = { args: { label: 'Course code', children: (control) => <TextInput {...control} value="DL101" readOnly /> } };
