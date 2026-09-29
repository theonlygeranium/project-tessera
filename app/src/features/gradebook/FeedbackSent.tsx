import type { Grade } from '../../../../shared/domain';
import { AiContent } from '../../components/AiContent/AiContent';

const shortFeedback = (value: string | undefined) => {
  const text = value?.trim() ?? '';
  return !text ? 'No feedback' : text.length > 140 ? `${text.slice(0, 137)}…` : text;
};

export function FeedbackSent({ grade }: { grade: Grade | null }) {
  const feedback = shortFeedback(grade?.feedback);
  if (!grade?.feedback.trim()) return <>{feedback}</>;
  return grade.feedbackOrigin === 'ai' || grade.feedbackProvenance
    ? <AiContent kind="note" who="Drafted with AI" source={`${grade.feedbackProvenance?.model ?? 'AI'} · reviewed by your instructor`}><p>{feedback}</p></AiContent>
    : <>{feedback}</>;
}
