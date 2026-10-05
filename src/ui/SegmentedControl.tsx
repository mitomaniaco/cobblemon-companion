import {Radio, RadioGroup} from 'react-aria-components';
import styles from './SegmentedControl.module.css';

export interface SegmentedControlProps<Key extends string> {
  label: string;
  options: ReadonlyArray<{key: Key; label: string}>;
  value: Key;
  onChange(value: Key): void;
  isDisabled?: boolean;
  className?: string;
}

export function SegmentedControl<Key extends string>({
  label,
  options,
  value,
  onChange,
  isDisabled = false,
  className,
}: SegmentedControlProps<Key>) {
  return (
    <RadioGroup
      aria-label={label}
      orientation="horizontal"
      className={`${styles.group}${className ? ` ${className}` : ''}`}
      value={value}
      onChange={(next) => onChange(next as Key)}
      isDisabled={isDisabled}
    >
      {options.map((option) => (
        <Radio key={option.key} value={option.key} className={styles.segment}>
          {option.label}
        </Radio>
      ))}
    </RadioGroup>
  );
}
