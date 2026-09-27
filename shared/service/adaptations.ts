import type { Adaptation, LearningProfile } from '../domain';
import type { Service } from './context';
import { PRESETS, presetById, recommendPreset } from '../presets';
import { fail, user } from './helpers';

const student = (ctx: Parameters<Service['applyPreset']>[0]) => {
  const signedIn = user(ctx);
  if (signedIn.role !== 'student') return fail('forbidden', 'Only students can use setups.');
  return signedIn;
};

const currentProfile = async (ctx: Parameters<Service['applyPreset']>[0]) => {
  const signedIn = student(ctx);
  const stored = await ctx.repo.getUser(signedIn.id);
  if (!stored?.profile) return fail('not-ready', 'Complete your learning profile first.');
  return stored;
};

const fieldFor = (kind: Adaptation['kind']): keyof LearningProfile | null =>
  kind === 'session-length' ? 'sessionMinutes' : kind === 'reminders' ? 'reminders' : kind === 'reading-level' ? 'readingLevel' : null;

export const adaptations: Pick<Service, 'listPresets' | 'suggestPreset' | 'applyPreset' | 'listAdaptations' | 'undoAdaptation'> = {
  listPresets: async () => [...PRESETS],
  suggestPreset: async ctx => {
    const stored = await currentProfile(ctx);
    return { ...recommendPreset(stored.profile!), provenance: null };
  },
  applyPreset: async (ctx, { presetId }) => {
    const preset = presetById(presetId) ?? fail('invalid', 'Unknown setup.');
    const stored = await currentProfile(ctx);
    const profile = stored.profile!;
    const candidates: { kind: Adaptation['kind']; before: unknown; after: unknown; why: string }[] = [
      { kind: 'session-length', before: profile.sessionMinutes, after: preset.sessionMinutes, why: `From the ${preset.title} setup: ${preset.sessionMinutes}-minute sessions. Today puts tasks that fit this session first.` },
      { kind: 'reminders', before: profile.reminders, after: preset.reminders, why: `From the ${preset.title} setup: ${preset.reminders} reminders.` },
      { kind: 'reading-level', before: profile.readingLevel, after: preset.readingLevel, why: `From the ${preset.title} setup: ${preset.readingLevel === 'plain' ? 'plain language' : 'standard'} reading.` },
    ];
    const changes = candidates.filter(change => change.before !== change.after);
    if (!changes.length) return [];
    const appliedAt = ctx.now();
    const result = changes.map(change => ({ id: ctx.newId('ad'), studentId: stored.id, ...change, appliedAt, undoneAt: null }));
    const updated: LearningProfile = { ...profile, sessionMinutes: preset.sessionMinutes, reminders: preset.reminders, readingLevel: preset.readingLevel };
    await ctx.repo.putUserWithAdaptations({ ...stored, profile: updated }, result);
    return result;
  },
  listAdaptations: async ctx => ctx.repo.listAdaptations(student(ctx).id),
  undoAdaptation: async (ctx, { adaptationId }) => {
    const signedIn = student(ctx);
    const adaptation = await ctx.repo.getAdaptation(adaptationId) ?? fail('not-found', 'Change not found.');
    if (adaptation.studentId !== signedIn.id) return fail('not-found', 'Change not found.');
    if (adaptation.undoneAt) return fail('conflict', 'This change was already undone.');
    const field = fieldFor(adaptation.kind) ?? fail('conflict', 'This change cannot be undone here.');
    const stored = await currentProfile(ctx);
    const profile = stored.profile!;
    if (profile[field] !== adaptation.after) return fail('conflict', "You've changed this since; edit it in your profile.");
    const updated = { ...profile };
    if (field === 'sessionMinutes') {
      if (adaptation.before === undefined) delete updated.sessionMinutes;
      else updated.sessionMinutes = adaptation.before as number;
    } else if (field === 'reminders') updated.reminders = adaptation.before as LearningProfile['reminders'];
    else updated.readingLevel = adaptation.before as LearningProfile['readingLevel'];
    const undone = { ...adaptation, undoneAt: ctx.now() };
    await ctx.repo.putUserWithAdaptations({ ...stored, profile: updated }, [undone]);
    return undone;
  },
};
