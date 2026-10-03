import {
  Button as AriaButton,
  FieldError,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select as AriaSelect,
  SelectValue,
  Text,
  type Key,
} from 'react-aria-components';
import {CaretDown, Check} from '@phosphor-icons/react';
import styles from './Select.module.css';

export interface SelectOption {
  key: string;
  label: string;
  textValue?: string;
  description?: string;
  isDisabled?: boolean;
}

export interface SelectProps {
  label: string;
  options: readonly SelectOption[];
  value: string | null;
  onChange(value: string | null): void;
  placeholder?: string;
  description?: string;
  errorMessage?: string;
  emptyMessage?: string;
  isDisabled?: boolean;
  isRequired?: boolean;
  isInvalid?: boolean;
  className?: string;
}

export function Select({
  label,
  options,
  value,
  onChange,
  placeholder = 'Selecione uma opção',
  description,
  errorMessage,
  emptyMessage = 'Nenhuma opção disponível.',
  isDisabled = false,
  isRequired = false,
  isInvalid = Boolean(errorMessage),
  className,
}: SelectProps) {
  return (
    <AriaSelect
      className={`${styles.root}${className ? ` ${className}` : ''}`}
      selectedKey={value}
      onSelectionChange={(key: Key | null) => onChange(key === null ? null : String(key))}
      isDisabled={isDisabled}
      isRequired={isRequired}
      isInvalid={isInvalid}
      placeholder={placeholder}
    >
      <Label className={styles.label}>{label}</Label>
      <AriaButton className={styles.trigger}>
        <SelectValue className={styles.value} />
        <CaretDown className={styles.triggerIcon} aria-hidden="true" weight="bold" />
      </AriaButton>
      {description && (
        <Text className={styles.description} slot="description">
          {description}
        </Text>
      )}
      {errorMessage && <FieldError className={styles.error}>{errorMessage}</FieldError>}
      <Popover className={styles.popover}>
        <ListBox className={styles.listBox} aria-label={`${label} opções`}>
          {options.map((option) => (
            <ListBoxItem
              key={option.key}
              id={option.key}
              textValue={option.textValue ?? option.label}
              isDisabled={option.isDisabled}
              className={styles.option}
            >
              <span className={styles.optionText}>
                <span>{option.label}</span>
                {option.description && <span className={styles.optionDescription}>{option.description}</span>}
              </span>
              <Check className={styles.checkIcon} aria-hidden="true" weight="bold" />
            </ListBoxItem>
          ))}
        </ListBox>
        {options.length === 0 && (
          <div className={styles.emptyMessage} role="status">
            {emptyMessage}
          </div>
        )}
      </Popover>
    </AriaSelect>
  );
}
