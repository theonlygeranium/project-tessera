import { expect, it } from 'vitest';
import type { LtiContext } from '../../domain';
import { seedData } from '../../seed';
import { MemoryRepo } from '../memory-repo';
import { createAndLinkLtiCourse, linkLtiContext } from './lti-core';

const now = '2026-09-29T00:00:00.000Z';
const context = (id: string): LtiContext => ({
  id,platformId:'lp-test',deploymentId:'deployment',contextId:id,title:'LMS course',label:'LMS',
  courseId:null,linkedBy:null,linkedAt:null,nrpsUrl:null,agsLineItemsUrl:null,lastRosterSyncAt:null,
});
const setup = async (id: string) => {
  const repo = new MemoryRepo(seedData()), ltiContext = context(id);
  await repo.putLtiContext(ltiContext);
  return {repo,ltiContext,deps:{repo,now:() => now,newId:() => 'c-new'}};
};

it('lets an administrator link an existing course they do not teach',async () => {
  const {repo,ltiContext,deps} = await setup('lc-admin');
  const linked = await linkLtiContext(deps,{context:ltiContext,courseId:'c-stat110',actorId:'u-admin'});
  expect(linked.courseId).toBe('c-stat110');
  expect((await repo.getLtiContextById(ltiContext.id))?.linkedBy).toBe('u-admin');
});

it('lets an instructor link only a course they teach',async () => {
  const {repo,ltiContext,deps} = await setup('lc-instructor');
  await expect(linkLtiContext(deps,{context:ltiContext,courseId:'c-comm120',actorId:'u-okafor'}))
    .rejects.toMatchObject({code:'forbidden',message:'You can link only a course you teach.'});
  expect((await repo.getLtiContextById(ltiContext.id))?.courseId).toBeNull();
  expect((await linkLtiContext(deps,{context:ltiContext,courseId:'c-stat110',actorId:'u-okafor'})).courseId).toBe('c-stat110');
});

it('keeps first-launch course creation with the instructor',async () => {
  const {repo,ltiContext,deps} = await setup('lc-new');
  const linked = await createAndLinkLtiCourse(deps,{context:ltiContext,actorId:'u-okafor',code:'NEW 101',title:'New course',term:'Fall 2026'});
  expect(linked.courseId).toBe('c-new');
  expect((await repo.getCourse('c-new'))?.instructorIds).toEqual(['u-okafor']);
  expect((await repo.getLtiContextById(ltiContext.id))?.linkedBy).toBe('u-okafor');
});
