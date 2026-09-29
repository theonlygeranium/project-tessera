import { ApiError } from '../../api';
import type { Course, Id, LtiContext, LtiPlatform, Timestamp } from '../../domain';
import type { Repo } from '../../repo';
import { resolveLtiUser } from './identity';
import { mintToolSession } from './tool-sessions';

export type LtiDeps = { repo: Repo; now(): Timestamp; newId(prefix: string): Id };
export type VerifiedLaunch = {
  platform: LtiPlatform; sub: string; roles: unknown; email?: string | null; name?: string | null;
  deploymentId: string; contextId: string; contextTitle: string; contextLabel: string;
  resourceLinkId: string; returnUrl: string | null; nrpsUrl: string | null; agsLineItemsUrl: string | null;
};

export async function registerPlatform(deps: LtiDeps, input: Omit<LtiPlatform, 'id' | 'createdAt' | 'lastLaunchAt'>): Promise<LtiPlatform> {
  if (!input.name.trim() || !input.issuer || !input.clientId || !input.deploymentIds.length || !input.jwksUrl || !input.authLoginUrl || !input.authTokenUrl) throw new ApiError('invalid', 'Platform registration is incomplete.');
  if (input.deploymentIds.some(x => !x.trim()) || new Set(input.deploymentIds).size !== input.deploymentIds.length) throw new ApiError('invalid', 'Deployment IDs must be distinct and nonempty.');
  if (await deps.repo.getLtiPlatform(input.issuer,input.clientId)) throw new ApiError('conflict', 'This issuer and client ID are already registered.');
  const platform: LtiPlatform = { ...input,id:deps.newId('lp'),createdAt:deps.now(),lastLaunchAt:null };
  await deps.repo.putLtiPlatform(platform);
  return platform;
}

export async function prepareLtiLaunch(deps: LtiDeps, claims: VerifiedLaunch): Promise<{ context: LtiContext; userId: Id; role: 'instructor' | 'student' | null }> {
  const { platform } = claims;
  const resolved = await resolveLtiUser(deps,{platformId:platform.id,sub:claims.sub,email:claims.email,name:claims.name,roles:claims.roles});
  let context = await deps.repo.getLtiContext(platform.id,claims.deploymentId,claims.contextId);
  if (!context) {
    context = { id:deps.newId('lc'),platformId:platform.id,deploymentId:claims.deploymentId,contextId:claims.contextId,
      title:claims.contextTitle,label:claims.contextLabel,courseId:null,linkedBy:null,linkedAt:null,
      nrpsUrl:claims.nrpsUrl,agsLineItemsUrl:claims.agsLineItemsUrl,lastRosterSyncAt:null };
  } else {
    context = {...context,title:claims.contextTitle,label:claims.contextLabel,nrpsUrl:claims.nrpsUrl,agsLineItemsUrl:claims.agsLineItemsUrl};
  }
  await deps.repo.putLtiContext(context);
  await deps.repo.touchLtiPlatform(platform.id,deps.now());
  context = (await deps.repo.getLtiContext(platform.id,claims.deploymentId,claims.contextId))!;
  return {context,userId:resolved.user.id,role:resolved.courseRole};
}

export async function finishLtiLaunch(deps: LtiDeps, input: { context: LtiContext; userId: Id; role: 'instructor' | 'student'; resourceLinkId: string; returnUrl: string | null }) {
  const {context, userId, role} = input;
  if (!context.courseId) throw new ApiError('conflict','This LMS course needs to be linked to a Tessera course.');
  const course = await deps.repo.getCourse(context.courseId);
  if (!course) throw new ApiError('conflict','The linked Tessera course no longer exists.');
  if (role === 'student') await deps.repo.addEnrollment(course.id,userId);
  else await deps.repo.addCourseInstructor(course.id,userId);
  return mintToolSession(deps,{userId,courseId:course.id,role,platformId:context.platformId,contextId:context.id,resourceLinkId:input.resourceLinkId,returnUrl:input.returnUrl});
}

export async function linkLtiContext(deps: LtiDeps, input: {context: LtiContext; courseId: Id; actorId: Id}): Promise<LtiContext> {
  const actor = await deps.repo.getUser(input.actorId);
  if (actor?.role !== 'administrator' && actor?.role !== 'instructor') throw new ApiError('forbidden','Only an administrator or LMS instructor can link this course.');
  const course = await deps.repo.getCourse(input.courseId);
  if (!course) throw new ApiError('not-found','The Tessera course was not found.');
  if (actor.role === 'instructor' && !course.instructorIds.includes(input.actorId)) throw new ApiError('forbidden','You can link only a course you teach.');
  if (!await deps.repo.linkLtiContext(input.context.id,course.id,input.actorId,deps.now())) throw new ApiError('conflict','This LMS course is already linked. Relaunch it.');
  return {...input.context,courseId:course.id,linkedBy:input.actorId,linkedAt:deps.now()};
}

export async function createAndLinkLtiCourse(deps: LtiDeps, input: {context: LtiContext; actorId: Id; code: string; title: string; term: string}): Promise<LtiContext> {
  const actor = await deps.repo.getUser(input.actorId);
  if (actor?.role !== 'instructor') throw new ApiError('forbidden','Only an LMS instructor can create this course.');
  if (input.context.courseId) throw new ApiError('conflict','This LMS course is already linked. Relaunch it.');
  const code = input.code.trim(), title = input.title.trim(), term = input.term.trim();
  if (!code || !title || !term || code.length>80 || title.length>200 || term.length>80) throw new ApiError('invalid','Enter a course code, title and term.');
  const course: Course = {id:deps.newId('c'),code,title,term,description:'',welcome:'',outcomes:[],instructorIds:[actor.id],status:'active',programId:null};
  await deps.repo.putCourse(course);
  return linkLtiContext(deps,{context:input.context,courseId:course.id,actorId:actor.id});
}
