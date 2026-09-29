// Rules the server enforces and the app previews, written once (D-003, D-005, principle #12).
import type { Access } from './api';
import type { AccentId, AiPolicy, Block, ReadinessIssue, ReadinessReport, Role, TutorMode, User, WorkloadRates } from './domain';

/** D-034: Rice CTE planning rates, editable through institution policy. */
export const RICE_DEFAULTS: WorkloadRates = { readingPagesPerHour: 34, problemSetHours: 2, writingHoursPerPage: 1, projectHours: 30, quizMinutes: 20, discussionMinutes: 45 };
export const MAX_WORKLOAD_RATE = 1000;
export const validWorkloadRate = (value: number): boolean => Number.isFinite(value) && value > 0 && value <= MAX_WORKLOAD_RATE;
export const validWorkloadRates = (rates: WorkloadRates): boolean => Object.values(rates).every(validWorkloadRate);
export const DEFAULT_DESIGN_PARTNER: NonNullable<AiPolicy['designPartner']> = { enabled: true, allowedArchitectures: null };
export const DEFAULT_AI_DISCLOSURE = 'Some starter content in this course was drafted with AI from the syllabus. I reviewed that content and am responsible for what appears in the course.';

export function workloadRatesFor(policy: AiPolicy): WorkloadRates { return policy.workloadRates ?? RICE_DEFAULTS; }
export function designPartnerPolicy(policy: AiPolicy): NonNullable<AiPolicy['designPartner']> {
  return { ...(policy.designPartner ?? DEFAULT_DESIGN_PARTNER), enabled: policy.aiAuthoring && (policy.designPartner?.enabled ?? true) };
}

/** Can this user call a route with this access rule? */
export function allows(access: Access, user: Pick<User, 'role'> | null): boolean {
  if (access === 'public') return true;
  if (!user) return false;
  if (access === 'signed-in') return true;
  return access.includes(user.role);
}

/**
 * Publish readiness for a lesson (D-003: nothing AI-drafted is published until a
 * person keeps it). Blocks are checked in order.
 */
export function lessonReadiness(blocks: Block[]): ReadinessReport {
  const issues: ReadinessIssue[] = [];
  if (blocks.length === 0) {
    issues.push({ code: 'empty-lesson', blockId: null, message: 'Add at least one block before publishing.' });
  }
  let lastLevel = 1; // the lesson title is the page's h1
  for (const b of blocks) {
    if (b.origin === 'ai' && b.aiState !== 'kept') {
      issues.push({ code: 'draft-block', blockId: b.id, message: 'An AI draft block hasn\'t been kept yet. Keep, edit, or revert it.' });
    }
    if (b.type === 'image' && !b.decorative && !b.alt.trim()) {
      issues.push({ code: 'missing-alt', blockId: b.id, message: 'An image needs alt text, or mark it decorative.' });
    }
    if (b.type === 'heading') {
      if (b.level > lastLevel + 1) {
        issues.push({ code: 'heading-order', blockId: b.id, message: `A level ${b.level} heading can't follow a level ${lastLevel} heading. Use level ${lastLevel + 1}.` });
      }
      lastLevel = b.level;
    }
    if (b.type === 'check') {
      const filled = b.options.filter((o) => o.text.trim());
      if (!b.question.trim() || filled.length < 2 || !b.options.some((o) => o.id === b.correctOptionId && o.text.trim())) {
        issues.push({ code: 'check-incomplete', blockId: b.id, message: 'A knowledge check needs a question, at least two answers, and a correct answer.' });
      }
    }
  }
  const aiBlocks = blocks.filter((b) => b.origin === 'ai');
  return {
    ready: issues.length === 0,
    issues,
    aiBlocks: aiBlocks.length,
    keptAiBlocks: aiBlocks.filter((b) => b.aiState === 'kept').length,
  };
}

export const TUTOR_MODES: { id: TutorMode; label: string; description: string }[] = [
  { id: 'off', label: 'Off', description: 'No tutor on this activity.' },
  { id: 'hints', label: 'Hints', description: 'Hints and worked parallel examples, never the answer.' },
  { id: 'explain', label: 'Explain', description: 'Explains concepts, but not the answer to this item.' },
  { id: 'open', label: 'Open', description: 'Answers directly. Practice only.' },
];

/** D-005 default: Open is never allowed on graded work. */
export function normalizePolicyModes(graded: TutorMode[], practice: TutorMode[]) {
  const order = TUTOR_MODES.map((m) => m.id);
  const clean = (list: TutorMode[]) => order.filter((m) => list.includes(m) || m === 'off');
  return { graded: clean(graded).filter((m) => m !== 'open'), practice: clean(practice) };
}

/**
 * Brand accents an administrator can pick: `accent-options` in design/tokens.json
 * (emitted as `--accent-option-<id>`), each at least 5.9:1 with white text (D-007).
 * The app sets `--accent` from the chosen option and derives hover and soft tints.
 */
export const ACCENTS: { id: AccentId; label: string }[] = [
  { id: 'teal', label: 'Teal (Tessera default)' },
  { id: 'blue', label: 'Blue' },
  { id: 'plum', label: 'Plum' },
  { id: 'rust', label: 'Rust' },
];

export const ROLE_LABELS: Record<Role, string> = {
  administrator: 'Administrator',
  instructor: 'Instructor',
  student: 'Student',
};

export function initialsFor(name: string): string {
  const parts = name.replace(/^(dr|prof|mr|ms|mrs)\.?\s+/i, '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isRole(value: string): value is Role {
  return value === 'administrator' || value === 'instructor' || value === 'student';
}

/** Parses `name,email,role` CSV (header row optional). Quotes are supported for names with commas. */
export function parseUserCsv(csv: string): { rows: { line: number; name: string; email: string; role: string }[] } {
  const rows: { line: number; name: string; email: string; role: string }[] = [];
  csv.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const cells: string[] = [];
    let cur = '';
    let quoted = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') {
        if (quoted && line[j + 1] === '"') { cur += '"'; j++; } else quoted = !quoted;
      } else if (ch === ',' && !quoted) { cells.push(cur.trim()); cur = ''; } else cur += ch;
    }
    cells.push(cur.trim());
    if (i === 0 && cells[0]?.toLowerCase() === 'name' && cells[1]?.toLowerCase() === 'email') return;
    rows.push({ line: i + 1, name: cells[0] ?? '', email: cells[1] ?? '', role: (cells[2] ?? '').toLowerCase() });
  });
  return { rows };
}
