import type {ReactNode} from 'react';
import {Switch as AriaSwitch} from 'react-aria-components';
import styles from './Switch.module.css';

export interface SwitchProps {
  children: ReactNode;
  isSelected: boolean;
  onChange(isSelected: boolean): void;
  isDisabled?: boolean;
  className?: string;
}

export function Switch({children, isSelected, onChange, isDisabled = false, className}: SwitchProps) {
  return (
    <AriaSwitch
      className={`${styles.switch}${className ? ` ${className}` : ''}`}
      isSelected={isSelected}
      onChange={onChange}
      isDisabled={isDisabled}
    >
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
      <span className={styles.label}>{children}</span>
    </AriaSwitch>
  );
}
