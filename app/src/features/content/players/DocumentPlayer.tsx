import { paragraphList, type DocumentContent } from '../model';
import styles from './players.module.css';

export function DocumentPlayer({ value }: { value: DocumentContent }) {
  return <article className={styles.player}>
    <h2>{value.title}</h2>
    {value.sections.map((section, index) => <section key={index} className={styles.section}>
      <h3>{section.heading}</h3>
      {paragraphList(section.text).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
    </section>)}
  </article>;
}
