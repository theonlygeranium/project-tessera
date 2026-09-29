import type { WorkerRecord } from '../domain';
import { stableJson } from '../hash';

/** Import metadata is not part of a worker version's substantive content. */
export function sameWorkerVersion(a: WorkerRecord, b: WorkerRecord): boolean {
  const { receivedAt: _aReceived, importId: _aImport, source: _aSource, ...aContent } = a;
  const { receivedAt: _bReceived, importId: _bImport, source: _bSource, ...bContent } = b;
  return stableJson(aContent) === stableJson(bContent);
}
