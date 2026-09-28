// Reporting lines and the manager view (D-025, D-026). Visibility is decided only by
// shared/managers/policy.ts: this module loads the rows that function asks for and
// returns its result. It never copies a report's email, profile, scores, or chats.
import type { ManagerView, MyVisibility, ReportingLine, RequiredTraining } from '../domain';
import { MANAGER_NEVER_SEES, MANAGER_SEES, isSharing, managerView, reportsOf, type ManagerViewInput } from '../managers/policy';
import { ManagerViewSchema } from '../schema/domain';
import type { Service, ServiceContext } from './context';
import { fail, user } from './helpers';
import { requiredTrainingFor } from './training';

async function myVisibility(ctx: ServiceContext): Promise<MyVisibility> {
  const me = user(ctx);
  const [lines, consents] = await Promise.all([
    ctx.repo.listReportingLines({ reportId: me.id }),
    ctx.repo.listManagerConsents({ reportId: me.id }),
  ]);
  const managers: MyVisibility['managers'] = [];
  for (const line of lines) {
    const manager = await ctx.repo.getUser(line.managerId);
    if (!manager) continue;
    const sharing = isSharing(lines, consents, line.managerId, me.id);
    const consent = consents.find((item) => item.managerId === line.managerId && item.reportId === me.id);
    managers.push({
      manager: { id: manager.id, name: manager.name, initials: manager.initials },
      sharing,
      since: sharing && consent ? consent.at : null,
    });
  }
  managers.sort((a, b) => a.manager.name.localeCompare(b.manager.name) || a.manager.id.localeCompare(b.manager.id));
  return { managers, sees: [...MANAGER_SEES], neverSees: [...MANAGER_NEVER_SEES] };
}

async function teamView(ctx: ServiceContext): Promise<ManagerView> {
  const me = user(ctx);
  const [lines, consents] = await Promise.all([
    ctx.repo.listReportingLines({ managerId: me.id }),
    ctx.repo.listManagerConsents({ managerId: me.id }),
  ]);
  const { sharing } = reportsOf(lines, consents, me.id);
  const people: ManagerViewInput['people'] = [];
  const training: Record<string, RequiredTraining[]> = {};
  const certificates: ManagerViewInput['certificates'] = {};
  for (const id of sharing) {
    const person = await ctx.repo.getUser(id);
    if (!person) continue;
    // Name and initials only. Required training comes from the same function the learner's own page uses.
    people.push({ id: person.id, name: person.name, initials: person.initials });
    const rows = await requiredTrainingFor(ctx, person);
    training[id] = rows;
    for (const row of rows) {
      if (!row.certificateId || certificates[row.certificateId]) continue;
      const cert = await ctx.repo.getCertificate(row.certificateId);
      if (!cert) continue;
      certificates[cert.id] = { id: cert.id, code: cert.code, replacedBy: cert.replacedBy, userId: cert.userId };
    }
  }
  const view = managerView({ managerId: me.id, lines, consents, people, training, certificates });
  if (!ManagerViewSchema.safeParse(view).success) fail('conflict', 'The manager view failed its privacy check.');
  return view;
}

export const managers: Pick<Service, 'listReportingLines' | 'addReportingLine' | 'removeReportingLine' | 'getMyVisibility' | 'setManagerSharing' | 'getManagerView'> = {
  async listReportingLines(ctx, filter) {
    return ctx.repo.listReportingLines(filter);
  },
  async addReportingLine(ctx, { managerId, reportId }) {
    if (managerId === reportId) fail('invalid', 'A person can\'t report to themself.');
    const [manager, report] = await Promise.all([ctx.repo.getUser(managerId), ctx.repo.getUser(reportId)]);
    if (!manager || !report) fail('not-found', 'Person not found.');
    if ((await ctx.repo.listReportingLines({ managerId, reportId })).length) fail('conflict', 'That reporting line already exists.');
    const line: ReportingLine = { managerId, reportId, createdBy: user(ctx).id, createdAt: ctx.now() };
    await ctx.repo.putReportingLine(line);
    return line;
  },
  async removeReportingLine(ctx, { managerId, reportId }) {
    if (!(await ctx.repo.listReportingLines({ managerId, reportId })).length) fail('not-found', 'Reporting line not found.');
    await ctx.repo.deleteReportingLine(managerId, reportId);
    return { ok: true };
  },
  async getMyVisibility(ctx) {
    return myVisibility(ctx);
  },
  async setManagerSharing(ctx, { managerId, sharing }) {
    const me = user(ctx);
    if (!(await ctx.repo.listReportingLines({ managerId, reportId: me.id })).length) fail('not-found', 'You do not report to this person.');
    await ctx.repo.putManagerConsent({ managerId, reportId: me.id, sharing, at: ctx.now() });
    return myVisibility(ctx);
  },
  async getManagerView(ctx) {
    return teamView(ctx);
  },
};
