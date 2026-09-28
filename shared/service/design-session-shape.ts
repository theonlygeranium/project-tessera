import type { DesignSession } from '../domain';

/** Older local M5 sessions did not persist the revision and lookup maps. */
export function normalizeDesignSession(session: DesignSession): DesignSession {
  const created = session.created ?? { outcomeIds: [], moduleIds: [], lessonIds: [], blockIds: [], assignmentIds: [], linkKeys: [] };
  const modules: Record<string, string> = {}, lessons: Record<string, string> = {}, assignments: Record<string, string> = {}, outcomes: Record<string, string> = {};
  session.plan?.modules.forEach((module, index) => {
    if (created.moduleIds[index]) modules[module.key] = created.moduleIds[index];
    module.lessons.forEach((lesson, i) => {
      const offset = session.plan!.modules.slice(0, index).reduce((n, value) => n + value.lessons.length, 0);
      if (created.lessonIds[offset + i]) lessons[lesson.key] = created.lessonIds[offset + i];
    });
    (module.assignments?.length ? module.assignments : module.assignment ? [module.assignment] : []).forEach((assignment, i) => {
      const offset = session.plan!.modules.slice(0, index).reduce((n, value) => n + (value.assignments?.length ?? (value.assignment ? 1 : 0)), 0);
      if (created.assignmentIds[offset + i]) assignments[assignment.key] = created.assignmentIds[offset + i];
    });
  });
  session.plan?.outcomes.forEach((outcome, index) => { if (created.outcomeIds[index]) outcomes[outcome.code] = created.outcomeIds[index]; });
  return { ...session, applyRevision: session.applyRevision ?? `legacy-${session.id}`, planIds: { modules, lessons, assignments, outcomes, ...session.planIds }, createdBlocks: session.createdBlocks ?? {}, undoKept: session.undoKept ?? [], confirmedPoints: session.confirmedPoints ?? {}, outcomeCodeMap: session.outcomeCodeMap ?? {} };
}
