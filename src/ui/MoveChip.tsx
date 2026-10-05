import type {CSSProperties, ReactNode} from 'react';
import {CircleDashed, HandFist, Lightning, Question, Spiral} from '@phosphor-icons/react';
import {categoryIconPath, typeIconPath} from './assets';
import styles from './MoveChip.module.css';
import {TypeBadge} from './TypeBadge';
import {TypeIcon} from './TypeIcon';
import {typeColorVar, typeInkVar} from './types';

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
  const style = {'--move-type': typeColorVar(type), '--move-ink': typeInkVar(type)} as CSSProperties;
  const hasTypeIcon = type !== null && typeIconPath(type) !== null;

  if (variant === 'chip') {
    return (
      <span className={styles.chip} style={style}>
        {type !== null && hasTypeIcon ? (
          <span className={styles.badge} aria-hidden="true">
            <TypeIcon type={type} className={styles.badgeIcon} />
          </span>
        ) : (
          <span className={styles.dot} aria-hidden="true" />
        )}
        <span className={styles.chipName}>{name}</span>
      </span>
    );
  }

  const icon = category ? CATEGORY_ICONS[category] : null;
  const categoryImage = category ? categoryIconPath(category) : null;
  return (
    <div className={styles.tile} style={style}>
      <span className={styles.tileIcon} data-mode={hasTypeIcon ? 'type' : 'category'}>
        {type !== null && hasTypeIcon ? (
          <TypeIcon type={type} className={styles.tileTypeIcon} />
        ) : icon ? (
          <icon.Icon aria-label={icon.label} role="img" weight="bold" />
        ) : (
          <Question aria-label="Categoria desconhecida" role="img" weight="bold" />
        )}
      </span>
      <span className={styles.tileBody}>
        <span className={styles.tileName}>{name}</span>
        <span className={styles.tileMeta}>
          {category && categoryImage ? (
            <img src={categoryImage} width={32} height={14} alt={CATEGORY_ICONS[category].label} />
          ) : (
            hasTypeIcon &&
            (icon ? (
              <icon.Icon aria-label={icon.label} role="img" weight="bold" />
            ) : (
              <Question aria-label="Categoria desconhecida" role="img" weight="bold" />
            ))
          )}
          {type && <TypeBadge type={type} size="sm" />}
          {power != null && (
            <span className={styles.power}>
              <Lightning weight="fill" aria-hidden="true" />
              <span className={styles.visuallyHidden}>Poder </span>
              {power}
            </span>
          )}
          {children}
        </span>
      </span>
    </div>
  );
}
