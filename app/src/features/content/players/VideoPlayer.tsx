import { embedSrc, fileContentUrl, minutesLabel, paragraphList, type VideoContent } from '../model';
import styles from './players.module.css';

export function VideoPlayer({ value }: { value: VideoContent }) {
  const embed = embedSrc(value);
  const title = value.title.trim() || 'Video';
  const paragraphs = paragraphList(value.transcript);
  return <figure className={styles.player}>
    <figcaption>
      <p className={styles.videoTitle}>{value.title}</p>
      <p className={styles.meta}>{minutesLabel(value.minutes)}</p>
    </figcaption>
    {value.provider === 'upload' ? <video className={styles.videoElement} controls preload="metadata" aria-label={title} src={value.src.trim() ? fileContentUrl(value.src) : undefined}>
      {value.captionsFileId?.trim() && <track kind="captions" src={fileContentUrl(value.captionsFileId)} srcLang="en" label="Captions" default />}
    </video> : embed ? <div className={styles.frame}>
      <iframe title={title} src={embed} allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
    </div> : <p className={styles.note}>{/^https?:\/\//.test(value.src.trim()) ? <a href={value.src} rel="noopener noreferrer">Open {title}</a> : 'This video cannot be played.'}</p>}
    <details className={styles.transcript}>
      <summary>Transcript</summary>
      <div className={styles.transcriptBody}>
        {paragraphs.length > 0 ? paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>) : <p>No transcript has been added.</p>}
      </div>
    </details>
  </figure>;
}
