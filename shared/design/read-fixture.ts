import type { AiTasks } from '../ai';
import type { BloomLevel, FinkCategory, SourceSpan } from '../domain';

const verbLevels: Record<string, [BloomLevel, FinkCategory]> = {
  tell: ['understand', 'foundational'], identify: ['remember', 'foundational'], describe: ['understand', 'foundational'],
  explain: ['understand', 'foundational'], calculate: ['apply', 'application'], apply: ['apply', 'application'],
  communicate: ['apply', 'integration'], design: ['create', 'application'], critique: ['evaluate', 'integration'],
  evaluate: ['evaluate', 'integration'], compare: ['analyze', 'integration'], analyze: ['analyze', 'integration'],
};

export function analyzeSyllabusFixture(input: AiTasks['syllabus-analyze']['input']): AiTasks['syllabus-analyze']['output'] {
  const { extraction } = input;
  const audits = extraction.outcomes.map(outcome => {
    const verb = outcome.text.trim().match(/^(?:students?\s+(?:will|can)\s+)?([\p{L}]+)/iu)?.[1].toLowerCase() ?? null;
    const level = verb ? verbLevels[verb] : undefined;
    const assessedBy = extraction.assessments.flatMap(assessment => {
      const a = `${assessment.title} ${assessment.format}`.toLowerCase();
      const o = outcome.text.toLowerCase();
      // Broad fixture rules are deliberately conservative about unmentioned assessment criteria.
      const related = (/question/.test(o) && /quiz|homework|exam/.test(a)) ||
        (/variab|distribut|center|spread/.test(o) && /homework|quiz|exam/.test(a)) ||
        (/study/.test(o) && /project/.test(a)) || (/communicat/.test(o) && /project/.test(a));
      if (!related) return [];
      return [{ assessmentId: assessment.id, fit: /multiple.choice/i.test(a) && level && !['remember', 'understand'].includes(level[0]) ? 'verb-mismatch' as const : 'assessed' as const }];
    });
    return { outcomeId: outcome.id, measurable: Boolean(level), verb, bloom: level?.[0] ?? null, fink: level?.[1] ?? null, mager: input.sourceKind === 'brief' ? { performance: Boolean(level), condition: /\b(?:using|given|in)\b/i.test(outcome.text), criterion: /\b(?:at least|within|correctly|accuracy)\b/i.test(outcome.text) } : null, assessedBy, suggestion: null };
  });
  const alignment = audits.flatMap(audit => extraction.assessments.map(assessment => ({ outcomeId: audit.outcomeId, assessmentId: assessment.id, state: audit.assessedBy.find(item => item.assessmentId === assessment.id)?.fit ?? 'none' as const })));
  const cites: SourceSpan[] = [extraction.profile.title.spans[0], extraction.outcomes[0]?.span, extraction.assessments[0]?.span, extraction.schedule[0]?.span].filter((span): span is SourceSpan => Boolean(span));
  const gapCount = audits.filter(audit => audit.assessedBy.length === 0).length;
  const summary = `Here is what I understood, and here is what I need from you. I found ${extraction.outcomes.length} outcomes and ${extraction.assessments.length} graded components. ${gapCount} ${gapCount === 1 ? 'outcome is' : 'outcomes are'} not clearly assessed in the source. Please check the cited passages and tell me where this reading needs to change.`;
  const rubricRefs = (tessera: string, oscqr: string) => [{ rubric: 'tessera' as const, item: tessera }, { rubric: 'oscqr' as const, item: oscqr }];
  const deficiencies: AiTasks['syllabus-analyze']['output']['deficiencies'] = [];
  for (const audit of audits) {
    const span = extraction.outcomes.find(item => item.id === audit.outcomeId)?.span;
    if (!audit.measurable) deficiencies.push({ code: `unobservable-${audit.outcomeId}`, message: `Could outcome O${input.extraction.outcomes.findIndex(item => item.id === audit.outcomeId) + 1} use an observable action?`, rubricRefs: rubricRefs('2.2', '9'), spans: span ? [span] : [] });
    if (!audit.assessedBy.length) deficiencies.push({ code: `unassessed-${audit.outcomeId}`, message: `I could not find an assessment for outcome O${input.extraction.outcomes.findIndex(item => item.id === audit.outcomeId) + 1}.`, rubricRefs: rubricRefs('3.2', '9'), spans: span ? [span] : [] });
  }
  const text = [...extraction.policies.map(item => item.text), extraction.profile.description.value ?? ''].join(' ').toLowerCase();
  const components = ['learner goals', 'choice', 'feedback', 'community', 'instructor presence', 'assessment clarity'].map(name => {
    const match = extraction.policies.find(item => item.text.toLowerCase().includes(name.split(' ')[0]));
    return { name, score: match ? 4 : 0, max: name === 'assessment clarity' ? 6 : 8, evidence: match?.span ?? null };
  });
  const score = components.reduce((sum, part) => sum + part.score, 0);
  const learnerCenteredness = input.sourceKind === 'brief' ? null : {
    palmer: { score, max: 46 as const, band: (score >= 30 ? 'learning-focused' : score >= 15 ? 'transitional' : 'content-focused') as 'learning-focused' | 'transitional' | 'content-focused', components },
    cullenHarris: { community: /discuss|peer|group/.test(text) ? 1 : 0, powerAndControl: /choice|choose/.test(text) ? 1 : 0, evaluation: /feedback|rubric/.test(text) ? 1 : 0, evidence: [] },
  };
  return { summary, cites, outcomeAudits: audits, alignment, learnerCenteredness, deficiencies };
}

export function rewriteObjectiveFixture({ outcome, nearbyTopics, industry }: AiTasks['objective-rewrite']['input']): AiTasks['objective-rewrite']['output'] {
  const subject = outcome.text.replace(/^(?:understand|know|appreciate|be familiar with|learn about)\s*/i, '').replace(/[.!?]+$/, '').trim() || nearbyTopics[0] || 'the course topic';
  return { text: `Explain ${subject}${industry ? ' in a workplace example' : ' using an example'}.`, why: 'An observable action gives you something learners can demonstrate.' };
}
