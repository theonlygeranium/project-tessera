/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ROUTES, API_PREFIX } from '../api';
import { OPERATIONS } from './operations';
import { validateInput } from './index';

describe('runtime API schemas', () => {
  it('covers every route', () => {
    expect(Object.keys(OPERATIONS).sort()).toEqual(Object.keys(ROUTES).sort());
  });
  it('rejects invalid blocks with useful paths', () => {
    expect(() => validateInput('saveBlocks', {lessonId:'l',blocks:[{type:'heading',level:4,text:'Bad'}]})).toThrow();
    expect(() => validateInput('saveBlocks', {lessonId:'l',blocks:[{type:'image',src:'image.png',alt:'Image',caption:''}]})).toThrow();
    try { validateInput('saveBlocks', {lessonId:'l',blocks:[{type:'heading',level:4,text:'Bad'}]}); } catch(e) { expect(e).toMatchObject({code:'invalid',details:{issues:[{path:'blocks[0].level'}]}}); }
  });
  it('validates email and pagination', () => {
    expect(() => validateInput('createUser',{name:'A',email:'bad',role:'student'})).toThrow();
    expect(validateInput('listFiles',{courseId:'course'})).toEqual({courseId:'course',limit:50});
    expect(() => validateInput('listFiles',{courseId:'course',limit:500})).toThrow();
  });
  it('accepts a two-module import', () => {
    const input={course:{code:'BIO 101',title:'Biology',term:'Fall'},modules:[{title:'Module 1',lessons:[{title:'Intro',blocks:[]}]},{title:'Module 2',lessons:[{title:'Cells',minutes:30,blocks:[]}]}]};
    expect(validateInput('importCourse',input)).toMatchObject(input);
  });
  it('builds OpenAPI with every route and method', () => {
    execFileSync('node',['tools/build_openapi.mjs']);
    const document=JSON.parse(readFileSync('docs/api/openapi.json','utf8'));
    expect(Object.keys(document.paths).length).toBe(new Set(Object.values(ROUTES).map(r=>API_PREFIX+r.path.replace(/:(\w+)/g,'{$1}'))).size);
    for(const [name,route] of Object.entries(ROUTES)) {
      const path=API_PREFIX+route.path.replace(/:(\w+)/g,'{$1}');
      expect(document.paths[path]?.[route.method.toLowerCase()]?.operationId).toBe(name);
    }
  });
});

describe('schemas match service rules (review 3)', () => {
  it('rejects empty-level and duplicate-id rubrics and out-of-range token requests', () => {
    const level = { id: 'l1', title: 'Clear', points: 5, description: '' };
    expect(() => validateInput('updateAssignment', { assignmentId: 'a', rubric: [{ id: 'c', title: 'C', description: '', levels: [] }] })).toThrow();
    expect(() => validateInput('updateAssignment', { assignmentId: 'a', rubric: [{ id: 'c', title: 'C', description: '', levels: [level, level] }] })).toThrow();
    expect(() => validateInput('updateAssignment', { assignmentId: 'a', rubric: [{ id: 'c', title: 'C', description: '', levels: [level] }, { id: 'c', title: 'D', description: '', levels: [level] }] })).toThrow();
    expect(validateInput('updateAssignment', { assignmentId: 'a', rubric: [{ id: 'c', title: 'C', description: '', levels: [level] }] })).toBeTruthy();
    expect(() => validateInput('createApiToken', { name: 'bot', scopes: [] })).toThrow();
    expect(() => validateInput('createApiToken', { name: 'bot', scopes: ['content:read'], expiresInDays: 366 })).toThrow();
  });
});

describe('review 4: schema limits', () => {
  it('rejects ungeneratable types and out-of-range hint limits', () => {
    expect(() => validateInput('generateElement', { lessonId: 'l', type: 'image' })).toThrow();
    expect(() => validateInput('generateAtScope', { courseId: 'c', scope: { elementTypes: ['video'] } })).toThrow();
    expect(() => validateInput('setTutorSetting', { activityKind: 'lesson', activityId: 'l', mode: 'hints', maxHints: 11, allowedSourceIds: [] })).toThrow();
    expect(() => validateInput('setTutorSetting', { activityKind: 'lesson', activityId: 'l', mode: 'hints', maxHints: 1.5, allowedSourceIds: [] })).toThrow();
  });
});
