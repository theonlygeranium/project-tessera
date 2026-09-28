import { Link } from 'react-router';
import { Card, PipelineStepper } from '../components';
import { useApiQuery } from '../data/hooks';
import { useSession } from '../shell/session';
import { SETUP_STEP_HELP } from './courseSetup';
import { setupStepStates, type SetupRole } from './setupStepStates';
import { useRemembered } from './storage';
import { paths } from '../paths';
import styles from './SetupChecklist.module.css';

function stepUrl(role: SetupRole, id: string, courseId: string) {
  if (role === 'admin') return id === 'content' || id === 'published' ? paths.admin.courseReadiness(courseId) : paths.admin.course(courseId);
  if (id === 'readiness') return paths.teach.readiness(courseId);
  if (id === 'drafts') return paths.teach.course(courseId);
  return paths.teach.course(courseId);
}
export function SetupChecklist({ role, courseId }: { role: SetupRole; courseId: string }) {
  const { user } = useSession();
  const [hidden, setHidden] = useRemembered(`tessera-help-${user.id}-setup-${role}-${courseId}`);
  const outline = useApiQuery('getCourseOutline', { courseId }, { enabled: !!courseId });
  const enrollments = useApiQuery('getCourseEnrollments', { courseId }, { enabled: !!courseId && role === 'admin' });
  const readiness = useApiQuery('getCourseReadiness', { courseId }, { enabled: !!courseId && role === 'instructor' });
  if (!outline.data || role === 'admin' && !enrollments.data) return null;
  const steps = setupStepStates(role, { outline: outline.data, enrollments: enrollments.data, readiness: readiness.data });
  const done = steps.filter(step => step.state === 'complete').length;
  const current = steps.find(step => step.state === 'current');
  if (done === steps.length && hidden) return null;
  return <Card as="section" variant="quiet" density="compact" className={styles.checklist} aria-label="Course setup">
    <div className={styles.heading}><h2>Course setup</h2><span>{done} of {steps.length} done</span></div>
    {current ? <><PipelineStepper label="Course setup steps" steps={steps} /><p>{SETUP_STEP_HELP[current.id]} <Link to={stepUrl(role, current.id, courseId)}>{current.label}</Link></p></> : <><p>Course setup is complete.</p><button type="button" onClick={() => setHidden(true)}>Hide checklist</button></>}
  </Card>;
}
