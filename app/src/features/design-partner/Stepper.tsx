import { PipelineStepper } from '../../components';

const stages = ['start', 'read', 'confirm', 'approaches', 'preview', 'review'] as const;
export function DesignStepper({ stage }: { stage: string }) {
  const active = stage === 'provisioning' ? stages.indexOf('review') : Math.max(0, stages.indexOf(stage as typeof stages[number]));
  return <PipelineStepper label="Design partner progress" steps={stages.map((id, index) => ({ id, label: id[0].toUpperCase() + id.slice(1), state: index < active ? 'complete' : index === active ? 'current' : 'upcoming' }))} />;
}
