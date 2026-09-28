import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { PageHelp } from './PageHelp';
import { writeRemembered } from './storage';

vi.mock('../shell/session', () => ({ useSession: () => ({ user: { id: 'u-test' } }) }));
const render = () => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(PageHelp, { topic: 'teach.workspace', courseId: 'c-test' })));
afterEach(() => { vi.unstubAllGlobals(); });
describe('PageHelp', () => {
  it('opens first and remembers a collapsed topic for this user', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
    expect(render()).toContain('aria-expanded="true"');
    writeRemembered('tessera-help-u-test-teach.workspace', true);
    const collapsed = render();
    expect(collapsed).toContain('aria-expanded="false"');
    expect(collapsed).toContain('About the course workspace');
    expect(collapsed).toMatch(/<div[^>]*hidden=\"\"/);
  });
  it('still renders when localStorage access throws', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(render()).toContain('This is where the course takes shape');
    expect(() => writeRemembered('tessera-help-u-test-teach.workspace', true)).not.toThrow();
  });
});
