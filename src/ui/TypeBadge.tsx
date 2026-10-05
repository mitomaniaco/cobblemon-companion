import type {CSSProperties} from 'react';
import styles from './TypeBadge.module.css';
import {typeColorVar, typeInkVar, typeLabel} from './types';

export interface TypeBadgeProps {
  type: string;
  size?: 'sm' | 'md';
}

export function TypeBadge({type, size = 'md'}: TypeBadgeProps) {
  const style: CSSProperties = {background: typeColorVar(type), color: typeInkVar(type)};
  return (
    <span className={`${styles.badge} ${styles[size]}`} style={style}>
      {typeLabel(type)}
    </span>
  );
}
