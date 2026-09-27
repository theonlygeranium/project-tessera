import type { Meta, StoryObj } from '@storybook/react-vite';
import { TopBar } from './TopBar';
import { Button } from '../Button/Button';

const meta = { title: 'Components/TopBar', component: TopBar, args: { title: 'Today' } } satisfies Meta<typeof TopBar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SimpleTitle: Story = {};
export const CourseBreadcrumb: Story = { args: { title: 'Module 1', eyebrow: 'Data Literacy 101', breadcrumbs: [
  { label: 'Courses', href: '#courses' }, { label: 'Data Literacy 101', href: '#course' }, { label: 'Module 1' },
], actions: <><Button>Edit module</Button><Button>Preview</Button></> } };
export const LongTitle: Story = { args: { title: 'Understanding evidence and interpreting charts in Data Literacy 101' } };
