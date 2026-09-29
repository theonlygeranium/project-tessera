import { describe, expect, it } from 'vitest';
import { mapLisRoles } from './roles';

const base = 'http://purl.imsglobal.org/vocab/lis/v2/membership';
describe('context LIS roles', () => {
  it.each([
    [['Instructor'],'instructor'], [['Learner'],'student'], [['ContentDeveloper'],'instructor'], [['TeachingAssistant'],'instructor'],
    [[`${base}#Instructor`],'instructor'], [[`${base}#ContentDeveloper`],'instructor'], [[`${base}#Learner`],'student'],
    [[`${base}/Instructor#TeachingAssistant`],'instructor'], [[`${base}/Instructor#Designer`],'instructor'], [[`${base}/Learner#Guest`],'student'],
    [['Learner','Instructor'],'instructor'],
    [[`${base}#Administrator`],null], [[`${base}#Mentor`],null], [[`${base}#Manager`],null], [[`${base}#Member`],null], [[`${base}#Officer`],null],
    [['http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator'],null],
    [['http://purl.imsglobal.org/vocab/lis/v2/system/person#Instructor'],null],
    [[`${base}#InstructorX`],null], [[`${base}#Instructor `],null], [['instructor'],null],
    [[3,null],null], ['Instructor',null], [null,null],
  ] as [unknown,'instructor'|'student'|null][])('%j → %s', (roles, expected) => expect(mapLisRoles(roles)).toBe(expected));
});
