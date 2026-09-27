import type { Meta, StoryObj } from '@storybook/react-vite';
import { GlobalRailNav } from './GlobalRailNav';

const meta = { title: 'Components/GlobalRailNav', component: GlobalRailNav,
  args: { label: 'Student', header: <strong>Meridian State University</strong>, footer: <span>Priya · Student</span>, currentId: 'today', items: [
    { id: 'today', label: 'Today', href: '#today', icon: '⌂' },
    { id: 'courses', label: 'Courses', href: '#courses', icon: '▤' },
    { id: 'announcements', label: 'Announcements', href: '#announcements', icon: '◉', badge: 3 },
    { id: 'profile', label: 'Profile', href: '#profile', icon: '○' },
  ] },
} satisfies Meta<typeof GlobalRailNav>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Student: Story = {};
export const Instructor: Story = { args: { label: 'Instructor', footer: <span>Dr. Okafor · Instructor</span>, currentId: 'grade', items: [
  { id: 'today', label: 'Today', href: '#today', icon: '⌂' }, { id: 'create', label: 'Create', href: '#create', icon: '＋' }, { id: 'grade', label: 'Grade', href: '#grade', icon: '▤' }, { id: 'insights', label: 'Insights', href: '#insights', icon: '◉' },
] } };
export const Administrator: Story = { args: { label: 'Administrator', footer: <span>Meridian State admin</span>, currentId: 'people', items: [
  { id: 'overview', label: 'Overview', href: '#overview', icon: '⌂' }, { id: 'people', label: 'People', href: '#people', icon: '○' }, { id: 'courses', label: 'Courses', href: '#courses', icon: '▤' }, { id: 'settings', label: 'Settings', href: '#settings', icon: '⚙' },
] } };
export const Wide: Story = { args: { ...Instructor.args, layout: 'wide', footer: 'Dr. Amara Okafor · Instructor' } };
