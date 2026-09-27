import { useEffect } from 'react';

/** Sets the document title ("Today · Tessera"). Every page calls this once. */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Tessera` : 'Tessera';
  }, [title]);
}
