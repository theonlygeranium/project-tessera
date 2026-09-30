import type { Meta, StoryObj } from '@storybook/react-vite';
import { goldenSetup } from '../../../../shared/grading/golden.fixture';
import { SetupCheckList } from './SetupCheckList';
const meta = { title: 'Components/SetupCheckList', component: SetupCheckList, args: { checks: [], setup: goldenSetup, onApplyFix: () => {} } } satisfies Meta<typeof SetupCheckList>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AllSeverities: Story = { args: { checks: [
  { code: 'weights-not-100', severity: 'fix', target: '', params: { total: 95 }, fixes: [{ label: 'Scale weights to 100%', patch: { categories: goldenSetup.categories } }] },
  { code: 'category-empty', severity: 'review', target: 'participation', params: { weight: 5 }, fixes: [] },
  { code: 'scheme-gap', severity: 'pass', target: '', params: {}, fixes: [] },
] } };
export const PassedOnly: Story = { args: { checks: [{ code: 'weights-not-100', severity: 'pass', target: '', params: {}, fixes: [] }] } };
