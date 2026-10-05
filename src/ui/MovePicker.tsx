import type {ReactNode} from 'react';
import {ListBox, ListBoxItem, type Key, type Selection} from 'react-aria-components';
import {CheckCircle} from '@phosphor-icons/react';
import {MoveChip, type MoveChipCategory} from './MoveChip';
import styles from './MovePicker.module.css';

interface MovePickerItem {
  key: string;
  /** Vira `aria-label` e `textValue` da opção. */
  textValue: string;
  name: string;
  type: string | null;
  category: MoveChipCategory | null;
  power?: number | null;
  /** Repassado como `children` do `MoveChip` tile. */
  meta?: ReactNode;
  /** Texto curto exibido quando a opção está desabilitada ("Equipado", "Fora do cálculo"). */
  note?: string;
  isDisabled?: boolean;
}

export interface MovePickerProps {
  label: string;
  items: readonly MovePickerItem[];
  selectedKey: string | null;
  onSelectionChange(key: string): void;
  variant: 'tile' | 'chip';
  isDisabled?: boolean;
  className?: string;
}

function firstKey(keys: Selection): Key | null {
  if (keys === 'all') return null;
  const [first] = keys;
  return first ?? null;
}

export function MovePicker({label, items, selectedKey, onSelectionChange, variant, isDisabled = false, className}: MovePickerProps) {
  const disabledKeys = isDisabled ? items.map((item) => item.key) : items.filter((item) => item.isDisabled).map((item) => item.key);
  return (
    <ListBox
      aria-label={label}
      className={`${styles.list} ${styles[variant]}${className ? ` ${className}` : ''}`}
      layout="grid"
      selectionMode="single"
      selectionBehavior="replace"
      disallowEmptySelection
      selectedKeys={selectedKey === null ? [] : [selectedKey]}
      disabledKeys={disabledKeys}
      onSelectionChange={(keys) => {
        const key = firstKey(keys);
        if (key !== null) onSelectionChange(String(key));
      }}
    >
      {items.map((item) => (
        <ListBoxItem
          key={item.key}
          id={item.key}
          textValue={item.textValue}
          aria-label={item.textValue}
          data-move-name={item.name}
          className={`${styles.item} ${styles[`${variant}Item`]}`}
        >
          <MoveChip name={item.name} type={item.type} category={item.category} power={item.power} variant={variant}>
            {item.meta}
          </MoveChip>
          {item.isDisabled && item.note && <span className={styles.note}>{item.note}</span>}
          <CheckCircle className={styles.seal} aria-hidden="true" weight="fill" />
        </ListBoxItem>
      ))}
    </ListBox>
  );
}
