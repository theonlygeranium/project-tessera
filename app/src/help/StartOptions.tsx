import { Link } from 'react-router';
import { Button, Card } from '../components';
import { useApiQuery } from '../data/hooks';
import { START_OPTIONS } from './courseSetup';
import { resolveHelpLink } from './links';
import styles from './StartOptions.module.css';

export function StartOptions({ courseId, hasLessons, onAddYourself }: { courseId: string; hasLessons: boolean; onAddYourself: () => void }) {
  const preview = useApiQuery('previewTemplate', { courseId }, { enabled: !!courseId && !hasLessons, retry: false });
  if (hasLessons) return null;
  return <section className={styles.section} aria-labelledby="start-options-title"><h2 id="start-options-title">Choose how to start</h2><div className={styles.options}>
    {START_OPTIONS.map(option => <Card key={option.id} as="article" density="compact"><h3>{option.title}</h3><p>{option.description}</p>
      {option.id === 'manual' ? <Button onClick={onAddYourself}>{option.action}</Button> : option.id === 'template' && preview.error?.code === 'not-found' ? <p>{option.unavailable}</p> : option.id === 'template' && preview.isPending ? <p>Checking template…</p> : <Link to={resolveHelpLink(option.link!, { courseId })}>{option.action}</Link>}
    </Card>)}
  </div></section>;
}
