import type { Meta, StoryObj } from '@storybook/react-vite';
import { PipelineStepper } from './PipelineStepper';

const labels = ['Brief', 'Outline', 'Draft', 'Review', 'Publish'];
const stepsAt = (current: number) => labels.map((label, index) => ({ id: label.toLowerCase(), label, state: index < current ? 'complete' as const : index === current ? 'current' as const : 'upcoming' as const, href: `#${label.toLowerCase()}` }));
const meta = { title: 'Components/PipelineStepper', component: PipelineStepper, args: { label: 'Authoring progress', steps: stepsAt(2) } } satisfies Meta<typeof PipelineStepper>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AtDraft: Story = {};
export const AllComplete: Story = { args: { steps: stepsAt(5) } };
export const FirstStep: Story = { args: { steps: stepsAt(0) } };
