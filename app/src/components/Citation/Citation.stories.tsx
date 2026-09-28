import type { Meta, StoryObj } from '@storybook/react-vite';
import { Citation } from './Citation';
const meta = { title: 'Components/Citation', component: Citation, args: { span: { page: 3, text: 'Course project 40% · Due December 4.' } } } satisfies Meta<typeof Citation>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Page: Story = {};
export const Pasted: Story = { args: { span: { page: null, text: 'Training brief passage.' } } };
