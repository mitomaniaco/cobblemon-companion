import type {CSSProperties} from 'react';
import styles from './HpBar.module.css';

export interface HpBarProps {
  total: number;
  minDamage: number;
  maxDamage: number;
  label: string;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Barra de HP do alvo: trecho sólido = HP restante após o dano máximo; trecho hachurado = faixa entre o
 * dano mínimo e o máximo. A cor segue o HP restante no roll mínimo (≥50% alto, ≥20% médio, senão baixo).
 */
export function HpBar({total, minDamage, maxDamage, label}: HpBarProps) {
  const hasTotal = total > 0;
  const solid = hasTotal ? clamp01((total - maxDamage) / total) : 0;
  const range = hasTotal ? Math.min(clamp01((maxDamage - minDamage) / total), 1 - solid) : 0;
  const remainingAtMin = hasTotal ? clamp01((total - minDamage) / total) : 0;
  const level = remainingAtMin >= 0.5 ? 'high' : remainingAtMin >= 0.2 ? 'mid' : 'low';
  const style = {'--hp-solid': solid, '--hp-range': range} as CSSProperties;

  return (
    <div className={styles.track} role="img" aria-label={label} data-level={level} style={style}>
      {hasTotal && (
        <>
          <span className={styles.solid} />
          <span className={styles.range} />
        </>
      )}
    </div>
  );
}
