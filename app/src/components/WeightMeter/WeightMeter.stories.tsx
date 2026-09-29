import type { Meta, StoryObj } from '@storybook/react-vite';
import { goldenSetup } from '../../../../shared/grading/golden.fixture';
import { WeightMeter } from './WeightMeter';
const meta = { title: 'Components/WeightMeter', component: WeightMeter, args: { categories: goldenSetup.categories } } satisfies Meta<typeof WeightMeter>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Complete: Story = {};
export const Shortfall: Story = { args: { categories: goldenSetup.categories.slice(0, 4) } };
export const Over: Story = { args: { categories: goldenSetup.categories.map(c => c.id === 'hw' ? { ...c, weight: 25 } : c) } };
