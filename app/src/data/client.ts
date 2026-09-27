// Chooses the API adapter once per page load.
//   default          → the Worker API (http.ts)
//   ?data=mock       → the in-memory mock (mock.ts); sticky for the tab
//   ?as=<userId>     → with the mock, start signed in as that persona (tests, audits)
import type { TesseraApi } from '../../../shared/api';
import { createHttpApi } from './http';
import { createMockApi } from './mock';

const KEY = 'tessera-data';

function readMode(): 'mock' | 'http' {
  const params = new URLSearchParams(location.search);
  const requested = params.get('data');
  try {
    if (requested === 'mock' || requested === 'http') sessionStorage.setItem(KEY, requested);
    const stored = sessionStorage.getItem(KEY);
    if (stored === 'mock' || stored === 'http') return stored;
  } catch { /* storage blocked: fall through */ }
  if (requested === 'mock') return 'mock';
  return import.meta.env.VITE_DATA === 'mock' ? 'mock' : 'http';
}

export const dataMode = readMode();

export const api: TesseraApi =
  dataMode === 'mock'
    ? createMockApi({ signedInAs: new URLSearchParams(location.search).get('as') })
    : createHttpApi();
