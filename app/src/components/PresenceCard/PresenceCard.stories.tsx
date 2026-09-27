import type { Meta, StoryObj } from '@storybook/react-vite';
import { PresenceCard } from './PresenceCard';
import { Button } from '../Button/Button';

const meta = { title: 'Components/PresenceCard', component: PresenceCard, args: { name: 'Dr. Okafor', role: 'Instructor', initials: 'DO', time: '2 hours ago', dateTime: '2026-09-27T09:00:00-07:00', title: 'Welcome to Data Literacy 101', pinned: true, unread: true, children: <p>Start with Module 1. I will be here to help you read your first chart.</p> } } satisfies Meta<typeof PresenceCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Announcement: Story = {};
export const ShortWelcome: Story = { args: { title: undefined, pinned: false, unread: false, children: <p>Welcome, Priya! I am glad you are here.</p> } };
export const WithActions: Story = { args: { actions: <Button>Mark as read</Button> } };
