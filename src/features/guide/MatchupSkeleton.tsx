import styles from './MatchupSkeleton.module.css';

/** Esqueleto das três colunas enquanto a tela de golpes carrega (código da tela é carregado sob demanda). */
export function MatchupSkeleton() {
  return (
    <div className={styles.skeleton} role="status" aria-label="Carregando a tela de golpes">
      <div className={styles.column}>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <span key={index} className={styles.block} />
        ))}
      </div>
      <div className={styles.column}>
        <span className={styles.block} data-size="verdict" />
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className={styles.block} />
        ))}
      </div>
      <div className={styles.column}>
        <span className={styles.block} data-size="art" />
        <span className={styles.block} />
        <span className={styles.block} />
      </div>
    </div>
  );
}
