// The signed-in persona and institution, for every screen.
import { createContext, useContext, type ReactNode } from 'react';
import type { Institution, User } from '../../../shared/domain';

export interface Session {
  user: User;
  institution: Institution;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ value, children }: { value: Session; children: ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** The current session. Only valid inside the signed-in shell. */
export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside the signed-in app shell');
  return session;
}
