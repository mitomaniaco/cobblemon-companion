import {type ReactNode, useId} from 'react';
import {Checkbox as AriaCheckbox} from 'react-aria-components';
import {Check, Minus} from '@phosphor-icons/react';
import styles from './Checkbox.module.css';

export interface CheckboxProps {
  children: ReactNode;
  /** Texto de apoio abaixo do rótulo, ligado por `aria-describedby`. */
  description?: ReactNode;
  isSelected: boolean;
  onChange(isSelected: boolean): void;
  isIndeterminate?: boolean;
  isDisabled?: boolean;
  isRequired?: boolean;
  className?: string;
}

export function Checkbox({
  children,
  description,
  isSelected,
  onChange,
  isIndeterminate = false,
  isDisabled = false,
  isRequired = false,
  className,
}: CheckboxProps) {
  const descriptionId = useId();

  return (
    <AriaCheckbox
      className={`${styles.checkbox}${className ? ` ${className}` : ''}`}
      isSelected={isSelected}
      onChange={onChange}
      isIndeterminate={isIndeterminate}
      isDisabled={isDisabled}
      isRequired={isRequired}
      aria-describedby={description ? descriptionId : undefined}
    >
      <span className={styles.indicator} aria-hidden="true">
        {isIndeterminate ? <Minus weight="bold" /> : <Check weight="bold" />}
      </span>
      <span className={styles.label}>
        {children}
        {description && (
          <span className={styles.description} id={descriptionId}>
            {description}
          </span>
        )}
      </span>
    </AriaCheckbox>
  );
}
