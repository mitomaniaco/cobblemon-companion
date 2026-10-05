import type {CSSProperties} from 'react';
import {typeIconPath} from './assets';
import styles from './TypeIcon.module.css';

export interface TypeIconProps {
  type: string;
  className?: string;
}

export function TypeIcon({type, className}: TypeIconProps) {
  const path = typeIconPath(type);
  if (path === null) return null;
  const style = {'--type-icon': `url("${path}")`} as CSSProperties;
  return <span className={`${styles.icon}${className ? ` ${className}` : ''}`} style={style} aria-hidden="true" />;
}
