import {
  Button as AriaButton,
  ComboBox as AriaComboBox,
  FieldError,
  Group,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Text,
  useFilter,
  type Key,
} from 'react-aria-components';
import {CaretDown, Check} from '@phosphor-icons/react';
import styles from './ComboBox.module.css';

export interface ComboBoxOption {
  key: string;
  label: string;
  textValue?: string;
  description?: string;
  isDisabled?: boolean;
}

export interface ComboBoxProps {
  label: string;
  options: readonly ComboBoxOption[];
  selectedKey: string | null;
  onSelectionChange(key: string | null): void;
  inputValue: string;
  onInputChange(value: string): void;
  placeholder?: string;
  description?: string;
  errorMessage?: string;
  emptyMessage?: string;
  isDisabled?: boolean;
  isRequired?: boolean;
  isInvalid?: boolean;
  className?: string;
}

export function ComboBox({
  label,
  options,
  selectedKey,
  onSelectionChange,
  inputValue,
  onInputChange,
  placeholder,
  description,
  errorMessage,
  emptyMessage = 'Nenhuma opção encontrada.',
  isDisabled = false,
  isRequired = false,
  isInvalid = Boolean(errorMessage),
  className,
}: ComboBoxProps) {
  const {contains} = useFilter({sensitivity: 'base'});
  const hasMatches =
    options.length > 0 && (inputValue.length === 0 || options.some((option) => contains(option.textValue ?? option.label, inputValue)));
  return (
    <AriaComboBox
      className={`${styles.root}${className ? ` ${className}` : ''}`}
      selectedKey={selectedKey}
      onSelectionChange={(key: Key | null) => onSelectionChange(key === null ? null : String(key))}
      inputValue={inputValue}
      onInputChange={onInputChange}
      defaultFilter={contains}
      allowsEmptyCollection
      isDisabled={isDisabled}
      isRequired={isRequired}
      isInvalid={isInvalid}
    >
      <Label className={styles.label}>{label}</Label>
      <Group className={styles.control}>
        <Input className={styles.input} placeholder={placeholder} />
        <AriaButton className={styles.trigger} aria-label={`Mostrar opções de ${label}`}>
          <CaretDown aria-hidden="true" weight="bold" />
        </AriaButton>
      </Group>
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
        {!hasMatches && (
          <div className={styles.emptyMessage} role="status">
            {emptyMessage}
          </div>
        )}
      </Popover>
    </AriaComboBox>
  );
}
