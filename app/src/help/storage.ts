import { useState } from 'react';

export function remembered(key: string): boolean {
  try { return localStorage.getItem(key) === 'yes'; } catch { return false; }
}
export function writeRemembered(key: string, value: boolean) {
  try { if (value) localStorage.setItem(key, 'yes'); else localStorage.removeItem(key); } catch { /* The component still responds without storage. */ }
}
export function useRemembered(key: string) {
  const [value, setValue] = useState(() => remembered(key));
  const remember = (next: boolean) => {
    setValue(next);
    writeRemembered(key, next);
  };
  return [value, remember] as const;
}
