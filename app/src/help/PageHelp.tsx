import { useId } from 'react';
import { Link } from 'react-router';
import { Card } from '../components';
import { useSession } from '../shell/session';
import { PAGE_HELP, type PageHelpId } from './courseSetup';
import { resolveHelpLink } from './links';
import { useRemembered } from './storage';
import styles from './PageHelp.module.css';

export function PageHelp({ topic, courseId }: { topic: PageHelpId; courseId?: string }) {
  const { user } = useSession();
  const [collapsed, setCollapsed] = useRemembered(`tessera-help-${user.id}-${topic}`);
  const id = useId();
  const help = PAGE_HELP[topic];
  return <Card as="section" variant="quiet" density="compact" className={styles.help}>
    <div className={styles.heading}><span className={styles.mark} aria-hidden="true">?</span><button type="button" className={styles.toggle} aria-expanded={!collapsed} aria-controls={id} onClick={() => setCollapsed(!collapsed)}>{help.title}</button></div>
    <div id={id} className={styles.body} hidden={collapsed}>
      <p>{help.summary}</p>
      {'steps' in help && help.steps && <ol>{help.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>}
      {'tips' in help && help.tips && <ul>{help.tips.map((tip, index) => <li key={index}>{tip}</li>)}</ul>}
      {'next' in help && help.next && <p>{help.next.text} <Link to={resolveHelpLink(help.next.link, { courseId })}>{help.next.label}</Link></p>}
    </div>
  </Card>;
}
