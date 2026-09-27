// Error text for Access screens. Separate from utils.ts, which stays free of browser imports for tests.
import { dataMode } from '../../data/client';

export function errorText(error: unknown): string {
  if (dataMode === 'mock' && error && typeof error === 'object' && 'code' in error && error.code === 'unsupported') return 'This action is unavailable in demo mode.';
  return error instanceof Error ? error.message : 'Could not complete the action.';
}
