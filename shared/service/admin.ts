import type { Service } from './context';
import { ApiError } from '../api';
import type { Role } from '../domain';
import { ACCENTS, initialsFor, isEmail, isRole, normalizePolicyModes, parseUserCsv } from '../policy';
import { fail, required, user } from './helpers';

export const admin: Pick<Service, 'updateInstitution' | 'updatePolicy' | 'getOverview' | 'listUsers' | 'createUser' | 'importUsers' | 'updateUser'> = {
  updateInstitution: async (ctx, input) => {
    const institution = await ctx.repo.getInstitution();
    if (input.name !== undefined) institution.name = required(input.name, 'name');
    if (input.shortName !== undefined) institution.shortName = required(input.shortName, 'shortName');
    if (input.accent !== undefined) {
      if (!ACCENTS.some(x => x.id === input.accent)) fail('invalid', 'Unknown accent.');
      institution.accent = input.accent;
    }
    if (input.setupComplete !== undefined) institution.setupComplete = input.setupComplete;
    await ctx.repo.putInstitution(institution); return institution;
  },
  updatePolicy: async (ctx, input) => {
    const institution = await ctx.repo.getInstitution();
    institution.policy = { aiAuthoring: input.aiAuthoring, tutorModes: normalizePolicyModes(input.tutorModes.graded, input.tutorModes.practice) };
    await ctx.repo.putInstitution(institution); return institution;
  },
  getOverview: async ctx => {
    const [users, courses, announcements] = await Promise.all([ctx.repo.listUsers(), ctx.repo.listCourses(), ctx.repo.listAnnouncements({})]);
    const lessons = (await Promise.all(courses.map(c => ctx.repo.listLessons({ courseId: c.id })))).flat();
    return { people: { administrator: users.filter(x => x.role === 'administrator').length, instructor: users.filter(x => x.role === 'instructor').length, student: users.filter(x => x.role === 'student').length }, courses: courses.length, publishedLessons: lessons.filter(x => x.status === 'published').length, draftLessons: lessons.filter(x => x.status === 'draft').length, announcements: announcements.filter(x => x.status === 'published').length };
  },
  listUsers: async (ctx, input) => ctx.repo.listUsers(input),
  createUser: async (ctx, input) => {
    const name = required(input.name, 'name'), email = required(input.email, 'email');
    if (!isEmail(email) || !isRole(input.role)) fail('invalid', 'Invalid email or role.');
    if (await ctx.repo.findUserByEmail(email)) fail('conflict', 'Email already exists.');
    const created = { id: ctx.newId('u'), name, email, role: input.role, initials: initialsFor(name), profile: null };
    await ctx.repo.putUser(created); return created;
  },
  importUsers: async (ctx, { csv }) => {
    const created: Awaited<ReturnType<Service['createUser']>>[] = [], errors: { line: number; message: string }[] = [];
    for (const row of parseUserCsv(csv).rows) {
      try { created.push(await admin.createUser(ctx, { name: row.name, email: row.email, role: row.role as Role })); }
      catch (error) { errors.push({ line: row.line, message: error instanceof ApiError ? error.message : 'Invalid row.' }); }
    }
    return { created, errors };
  },
  updateUser: async (ctx, input) => {
    const found = await ctx.repo.getUser(input.userId) ?? fail('not-found', 'User not found.');
    if (input.name !== undefined) { found.name = required(input.name, 'name'); found.initials = initialsFor(found.name); }
    if (input.role !== undefined) {
      if (!isRole(input.role) || input.userId === user(ctx).id) fail('invalid', 'Cannot change this role.');
      found.role = input.role;
    }
    await ctx.repo.putUser(found); return found;
  },
};
