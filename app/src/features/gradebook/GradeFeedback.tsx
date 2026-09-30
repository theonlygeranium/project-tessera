import type { Output } from '../../../../shared/api';
import { AiContent } from '../../components/AiContent/AiContent';

export function GradeFeedback({ item }: { item: Output<'getMyGrade'>['items'][number] }) {
  if (!item.feedback) return null;
  return item.feedbackOrigin === 'ai'
    ? <AiContent kind="note" who="Drafted with AI" source={`${item.feedbackProvenance?.model ?? 'AI'} · reviewed by your instructor`}><p>{item.feedback}</p></AiContent>
    : <p>Feedback: {item.feedback}</p>;
}
