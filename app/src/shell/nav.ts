// Rail items per persona. Instructors also get course items while inside a course.
import type { ReactNode } from 'react';
import type { Role } from '../../../shared/domain';
import { paths } from '../paths';
import { icons } from './icons';

export interface NavItem { id: string; label: string; href: string; icon: ReactNode; badge?: number }

export function navFor(role: Role, options: { courseId?: string; unread?: number } = {}): NavItem[] {
  if (role === 'administrator') {
    return [
      { id: 'overview', label: 'Overview', href: paths.admin.overview, icon: icons.overview },
      { id: 'setup', label: 'Setup', href: paths.admin.setup, icon: icons.setup },
      { id: 'people', label: 'People', href: paths.admin.people, icon: icons.people },
      { id: 'courses', label: 'Courses', href: paths.admin.courses, icon: icons.courses },
      { id: 'policy', label: 'AI policy', href: paths.admin.policy, icon: icons.policy },
    ];
  }
  if (role === 'instructor') {
    const items: NavItem[] = [{ id: 'courses', label: 'My courses', href: paths.teach.courses, icon: icons.courses }];
    const c = options.courseId;
    if (c) {
      items.push(
        { id: 'workspace', label: 'Course', href: paths.teach.course(c), icon: icons.workspace },
        { id: 'build', label: 'Build with AI', href: paths.teach.build(c), icon: icons.build },
        { id: 'announcements', label: 'Announcements', href: paths.teach.announcements(c), icon: icons.announcements },
        { id: 'roster', label: 'Roster', href: paths.teach.roster(c), icon: icons.roster },
      );
    }
    return items;
  }
  return [
    { id: 'today', label: 'Today', href: paths.student.today, icon: icons.today },
    { id: 'courses', label: 'Courses', href: paths.student.courses, icon: icons.courses },
    { id: 'announcements', label: 'Announcements', href: paths.student.announcements, icon: icons.announcements, badge: options.unread || undefined },
    { id: 'profile', label: 'Profile', href: paths.student.profile, icon: icons.profile },
  ];
}

/** Which rail item is current for a path. The most specific (longest) matching href wins. */
export function currentNavId(items: NavItem[], pathname: string): string | undefined {
  const match = items
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.id;
}
