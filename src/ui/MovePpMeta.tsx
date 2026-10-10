import styles from './MovePpMeta.module.css';

export interface MovePpMetaProps {
  pp: number | null | undefined;
  ppUps: number | null;
}

/** `PP n` e os três pontos de PP Ups, como no resto do app. */
export function MovePpMeta({pp, ppUps}: MovePpMetaProps) {
  return (
    <>
      <span>PP {pp ?? '?'}</span>
      <span className={styles.ppUps} role="img" aria-label={ppUps === null ? 'PP Ups não capturado' : `PP Ups ${ppUps}`}>
        {[0, 1, 2].map((dot) => (
          <span key={dot} className={styles.ppDot} data-filled={ppUps !== null && dot < ppUps ? 'true' : undefined} />
        ))}
      </span>
    </>
  );
}
