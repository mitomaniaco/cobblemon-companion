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
 * Segmentos da barra: trecho sólido = HP restante após o dano máximo; trecho hachurado = faixa entre o
 * dano mínimo e o máximo, limitada ao HP. A cor segue o HP restante no roll mínimo (≥50% alto, ≥20% médio, senão baixo).
 */
export function hpBarSegments(
  total: number,
  minDamage: number,
  maxDamage: number,
): {solid: number; range: number; level: 'high' | 'mid' | 'low'} {
  if (total <= 0) return {solid: 0, range: 0, level: 'low'};
  const solid = clamp01((total - maxDamage) / total);
  const atMin = clamp01((total - minDamage) / total);
  return {solid, range: Math.max(0, atMin - solid), level: atMin >= 0.5 ? 'high' : atMin >= 0.2 ? 'mid' : 'low'};
}

/** Barra de HP do alvo; veja `hpBarSegments` para a matemática. */
export function HpBar({total, minDamage, maxDamage, label}: HpBarProps) {
  const hasTotal = total > 0;
  const {solid, range, level} = hpBarSegments(total, minDamage, maxDamage);
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
