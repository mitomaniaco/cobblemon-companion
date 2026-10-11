import type {CSSProperties} from 'react';
import styles from './TypeDot.module.css';
import {TypeIcon} from './TypeIcon';
import {typeColorVar, typeInkVar, typeLabel} from './types';

export interface TypeDotProps {
  type: string;
  size?: 'sm' | 'md';
}

/** Chip redondo colorido só com o ícone do tipo; o nome fica no rótulo acessível. */
export function TypeDot({type, size = 'md'}: TypeDotProps) {
  const style: CSSProperties = {background: typeColorVar(type), color: typeInkVar(type)};
  return (
    <span className={`${styles.dot} ${styles[size]}`} style={style} role="img" aria-label={typeLabel(type)} title={typeLabel(type)}>
      <TypeIcon type={type} />
    </span>
  );
}
