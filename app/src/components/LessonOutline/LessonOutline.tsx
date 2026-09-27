import type { HTMLAttributes, ReactNode } from 'react';
import type { LinkRenderProps } from '../links';
import styles from './LessonOutline.module.css';

type Direction = 'up' | 'down';
export type LessonOutlineProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  modules: { id: string; title: string; lessons: { id: string; title: string; minutes?: number; state?: 'done' | 'current' | 'todo'; href?: string; status?: string }[] }[];
  mode: 'student' | 'author';
  currentLessonId?: string;
  renderLink?: (props: LinkRenderProps) => ReactNode;
  onMoveLesson?: (lessonId: string, direction: Direction) => void;
  onMoveModule?: (moduleId: string, direction: Direction) => void;
};

function MoveButtons({ title, kind, first, last, onMove }: { title: string; kind: string; first: boolean; last: boolean; onMove?: (direction: Direction) => void }) {
  if (!onMove) return null;
  return <span className={styles.moves}>
    <button type="button" aria-label={`Move '${title}' up`} title={`Move ${kind} up`} disabled={first} onClick={() => onMove('up')}>↑</button>
    <button type="button" aria-label={`Move '${title}' down`} title={`Move ${kind} down`} disabled={last} onClick={() => onMove('down')}>↓</button>
  </span>;
}

export function LessonOutline({ modules, mode, currentLessonId, renderLink, onMoveLesson, onMoveModule, className, ...sectionProps }: LessonOutlineProps) {
  return <section {...sectionProps} className={[styles.outline, className].filter(Boolean).join(' ')}>
    <ol className={styles.modules}>{modules.map((module, moduleIndex) => <li key={module.id} className={styles.module}>
      <div className={styles.moduleHead}><h3>{module.title}</h3>{mode === 'author' && <MoveButtons title={module.title} kind="module" first={moduleIndex === 0} last={moduleIndex === modules.length - 1} onMove={onMoveModule ? (direction) => onMoveModule(module.id, direction) : undefined} />}</div>
      {module.lessons.length === 0 ? <p className={styles.empty}>No lessons yet</p> : <ol className={styles.lessons}>{module.lessons.map((lesson, lessonIndex) => {
        const state = lesson.id === currentLessonId ? 'current' : (lesson.state ?? 'todo');
        const stateText = state === 'done' ? 'Done' : state === 'current' ? 'Current' : 'To do';
        const content = <><span className={[styles.lessonTitle, state === 'current' && styles.current].filter(Boolean).join(' ')}>{lesson.title}</span>{mode === 'student' ? <span className={styles.meta}><span className={styles.state}>{stateText}</span>{lesson.minutes !== undefined && <span>{lesson.minutes} min</span>}</span> : lesson.status && <span className={styles.status}>{lesson.status}</span>}</>;
        const linkProps: LinkRenderProps = { href: lesson.href ?? '', className: styles.lessonLink, children: content, 'aria-current': state === 'current' ? 'page' : undefined };
        return <li key={lesson.id} className={styles.lesson}><div className={styles.lessonRow}>
          {lesson.href ? (renderLink ? renderLink(linkProps) : <a {...linkProps} />) : <span className={styles.lessonStatic} aria-current={state === 'current' ? 'page' : undefined}>{content}</span>}
          {mode === 'author' && <MoveButtons title={lesson.title} kind="lesson" first={lessonIndex === 0} last={lessonIndex === module.lessons.length - 1} onMove={onMoveLesson ? (direction) => onMoveLesson(lesson.id, direction) : undefined} />}
        </div></li>;
      })}</ol>}
    </li>)}</ol>
  </section>;
}
