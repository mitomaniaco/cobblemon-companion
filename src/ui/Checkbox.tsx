import type {ReactNode} from 'react';
import {Checkbox as AriaCheckbox} from 'react-aria-components';
import {Check, Minus} from '@phosphor-icons/react';
import styles from './Checkbox.module.css';

export interface CheckboxProps {
  children: ReactNode;
  isSelected: boolean;
  onChange(isSelected: boolean): void;
  isIndeterminate?: boolean;
  isDisabled?: boolean;
  isRequired?: boolean;
  className?: string;
}

export function Checkbox({
  children,
  isSelected,
  onChange,
  isIndeterminate = false,
  isDisabled = false,
  isRequired = false,
  className,
}: CheckboxProps) {
  return (
    <AriaCheckbox
      className={`${styles.checkbox}${className ? ` ${className}` : ''}`}
      isSelected={isSelected}
      onChange={onChange}
      isIndeterminate={isIndeterminate}
      isDisabled={isDisabled}
      isRequired={isRequired}
    >
      <span className={styles.indicator} aria-hidden="true">
        {isIndeterminate ? <Minus weight="bold" /> : <Check weight="bold" />}
      </span>
      <span className={styles.label}>{children}</span>
    </AriaCheckbox>
  );
}
