// Everything the readiness engine reads about a course, gathered once by the service
// (shared/service/) so the checks stay pure and testable.
import type { Assignment, Block, Course, CourseTemplate, Id, Lesson, Module, Outcome, OutcomeLink, User } from '../domain';

export interface CourseSnapshot {
  course: Course;
  /** Ordered by position. */
  modules: Module[];
  /** Ordered by module position, then lesson position. Never variant lessons. */
  lessons: Lesson[];
  /** Blocks per lesson id, ordered by position. */
  blocks: Record<Id, Block[]>;
  assignments: Assignment[];
  outcomes: Outcome[];
  outcomeLinks: OutcomeLink[];
  /** The course's latest accessibility score (null when nothing has been scanned) and the score it must reach. */
  access: { score: number | null; minimum: number };
  /** The course's effective template (program's, else institution's), or null. */
  template: CourseTemplate | null;
  instructors: Pick<User, 'id' | 'name' | 'email'>[];
}

/** The readable text of a block, for reading level and pattern checks. Check answers aren't included. */
export function blockText(block: Block): string {
  switch (block.type) {
    case 'heading':
    case 'text':
      return block.text;
    case 'callout':
      return [block.title, block.text].filter(Boolean).join('. ');
    case 'document':
      return [block.title, ...block.sections.flatMap((s) => [s.heading, s.text])].join('\n\n');
    case 'check':
      return block.question;
    case 'scenario':
      return [block.title, block.setting, ...block.nodes.map((n) => n.text)].join('\n\n');
    case 'link':
      return [block.text, block.description].join('. ');
    case 'table':
      return [block.caption, ...block.rows.map((r) => r.join(' '))].join('\n');
    case 'file':
      return [block.title, block.description].join('. ');
    case 'video':
      return block.title;
    case 'image':
      return block.caption;
  }
}

/** Prose blocks: what reading level is measured on. */
export function proseText(block: Block): string {
  switch (block.type) {
    case 'text':
      return block.text;
    case 'callout':
      return block.text;
    case 'document':
      return block.sections.map((s) => s.text).join('\n\n');
    default:
      return '';
  }
}

export function allBlocks(snapshot: CourseSnapshot): { lesson: Lesson; block: Block }[] {
  return snapshot.lessons.flatMap((lesson) => (snapshot.blocks[lesson.id] ?? []).map((block) => ({ lesson, block })));
}
