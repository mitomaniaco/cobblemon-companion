import type {CSSProperties, ReactNode} from 'react';
import {CircleDashed, HandFist, Question, Spiral} from '@phosphor-icons/react';
import styles from './MoveChip.module.css';
import {TypeBadge} from './TypeBadge';
import {typeColorVar} from './types';

export type MoveChipCategory = 'Physical' | 'Special' | 'Status';

export interface MoveChipProps {
  name: string;
  type: string | null;
  category: MoveChipCategory | null;
  power?: number | null;
  variant: 'chip' | 'tile';
  /** Metadados extras exibidos na linha de apoio do tile. */
  children?: ReactNode;
}

const CATEGORY_ICONS = {
  Physical: {Icon: HandFist, label: 'Físico'},
  Special: {Icon: Spiral, label: 'Especial'},
  Status: {Icon: CircleDashed, label: 'Status'},
} as const;

export function MoveChip({name, type, category, power, variant, children}: MoveChipProps) {
  const style = {'--move-type': typeColorVar(type)} as CSSProperties;

  if (variant === 'chip') {
    return (
      <span className={styles.chip} style={style}>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.chipName}>{name}</span>
      </span>
    );
  }

  const icon = category ? CATEGORY_ICONS[category] : null;
  return (
    <div className={styles.tile} style={style}>
      <span className={styles.tileIcon}>
        {icon ? (
          <icon.Icon aria-label={icon.label} role="img" weight="bold" />
        ) : (
          <Question aria-label="Categoria desconhecida" role="img" weight="bold" />
        )}
      </span>
      <span className={styles.tileBody}>
        <span className={styles.tileName}>{name}</span>
        <span className={styles.tileMeta}>
          {type && <TypeBadge type={type} size="sm" />}
          {power != null && <span>Poder {power}</span>}
          {children}
        </span>
      </span>
    </div>
  );
}
