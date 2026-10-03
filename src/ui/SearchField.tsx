import {
  Button as AriaButton,
  FieldError,
  Input,
  Label,
  SearchField as AriaSearchField,
  Text,
} from 'react-aria-components';
import {MagnifyingGlass, X} from '@phosphor-icons/react';
import styles from './SearchField.module.css';

export interface SearchFieldProps {
  label: string;
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  description?: string;
  errorMessage?: string;
  isDisabled?: boolean;
  isRequired?: boolean;
  isInvalid?: boolean;
  className?: string;
}

export function SearchField({
  label,
  value,
  onChange,
  placeholder,
  description,
  errorMessage,
  isDisabled = false,
  isRequired = false,
  isInvalid = Boolean(errorMessage),
  className,
}: SearchFieldProps) {
  return (
    <AriaSearchField
      className={`${styles.root}${className ? ` ${className}` : ''}`}
      value={value}
      onChange={onChange}
      isDisabled={isDisabled}
      isRequired={isRequired}
      isInvalid={isInvalid}
    >
      <Label className={styles.label}>{label}</Label>
      <div className={styles.control}>
        <MagnifyingGlass className={styles.searchIcon} aria-hidden="true" weight="regular" />
        <Input className={styles.input} placeholder={placeholder} />
        <AriaButton className={styles.clearButton} slot="clear" aria-label="Limpar busca">
          <X aria-hidden="true" weight="bold" />
        </AriaButton>
      </div>
      {description && <Text className={styles.description} slot="description">{description}</Text>}
      {errorMessage && <FieldError className={styles.error}>{errorMessage}</FieldError>}
    </AriaSearchField>
  );
}
