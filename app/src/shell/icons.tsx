// Small line icons for the navigation rail. Decorative: the rail always shows text labels.
import type { ReactNode } from 'react';

const Icon = ({ children }: { children: ReactNode }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>
);

export const icons = {
  today: <Icon><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></Icon>,
  courses: <Icon><path d="M4 6h7v13H4zM13 6h7v13h-7z" /></Icon>,
  announcements: <Icon><path d="M4 10v4h3l6 4V6L7 10H4z" /><path d="M16 9a4 4 0 0 1 0 6" /></Icon>,
  profile: <Icon><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5" /></Icon>,
  overview: <Icon><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Icon>,
  setup: <Icon><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></Icon>,
  people: <Icon><circle cx="9" cy="9" r="3" /><path d="M3 19c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5" /><path d="M16 6.5a3 3 0 0 1 0 5.5M18 14.8c1.5.6 2.5 1.9 3 4.2" /></Icon>,
  policy: <Icon><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /></Icon>,
  build: <Icon><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></Icon>,
  roster: <Icon><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></Icon>,
  workspace: <Icon><path d="M4 5h16v14H4z" /><path d="M4 9h16M9 9v10" /></Icon>,
};
