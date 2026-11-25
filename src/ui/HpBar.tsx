import type {CSSProperties} from 'react';
import styles from './HpBar.module.css';

export interface HpBarProps {
  total: number;
  minDamage: number;
  maxDamage: number;
  label: string;
  /**
   * `remaining` (padrão): a barra mostra o HP que sobra, com cor pelo HP restante.
   * `dealt`: a barra mostra o dano causado (resto cinza, dano certo sólido, faixa de variação hachurada),
   * com cor pelo tamanho do dano no ponto médio da faixa.
   */
  mode?: 'remaining' | 'dealt';
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

export type DamageLevel = 'great' | 'good' | 'some' | 'little';

/** Nível do dano pelo ponto médio da faixa, em % do HP: ≥75 enorme, ≥50 bom, ≥25 algum, senão pouco. */
export function damageLevel(minPercent: number, maxPercent: number): DamageLevel {
  const middle = (minPercent + maxPercent) / 2;
  return middle >= 75 ? 'great' : middle >= 50 ? 'good' : middle >= 25 ? 'some' : 'little';
}

/**
 * Segmentos do dano causado, em fração do HP: `keep` = HP que sobra mesmo no dano máximo, `sure` = dano garantido
 * (mínimo), `maybe` = faixa de variação entre o mínimo e o máximo. Tudo limitado a 100% do HP.
 */
export function hpDealtSegments(
  total: number,
  minDamage: number,
  maxDamage: number,
): {keep: number; maybe: number; sure: number; level: DamageLevel} {
  if (total <= 0) return {keep: 1, maybe: 0, sure: 0, level: 'little'};
  const sure = clamp01(minDamage / total);
  const worst = clamp01(maxDamage / total);
  return {keep: 1 - worst, maybe: Math.max(0, worst - sure), sure, level: damageLevel(sure * 100, worst * 100)};
}

/** Barra de HP do alvo; veja `hpBarSegments` e `hpDealtSegments` para a matemática de cada modo. */
export function HpBar({total, minDamage, maxDamage, label, mode = 'remaining'}: HpBarProps) {
  if (mode === 'dealt') {
    const {keep, maybe, sure, level} = hpDealtSegments(total, minDamage, maxDamage);
    const style = {'--hp-keep': keep, '--hp-maybe': maybe, '--hp-sure': sure} as CSSProperties;
    return (
      <div className={styles.track} role="img" aria-label={label} data-mode="dealt" data-level={level} style={style}>
        <span className={styles.keep} />
        <span className={styles.maybe} />
        <span className={styles.sure} />
      </div>
    );
  }
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
