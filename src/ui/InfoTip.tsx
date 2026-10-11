import {Info} from '@phosphor-icons/react';
import type {ReactNode} from 'react';
import {Button as AriaButton, Dialog, DialogTrigger, Popover} from 'react-aria-components';
import styles from './InfoTip.module.css';

interface InfoTipProps {
  /** Nome acessível do botão (ex.: "Por que esta distribuição"). */
  label: string;
  className?: string;
  children: ReactNode;
}

/** Botão "i" pequeno que abre um balão com o texto longo; alcançável por teclado e fecha com Esc. */
export function InfoTip({label, className, children}: InfoTipProps) {
  return (
    <DialogTrigger>
      <AriaButton className={`${styles.trigger}${className ? ` ${className}` : ''}`} aria-label={label}>
        <Info aria-hidden="true" weight="bold" />
      </AriaButton>
      <Popover className={styles.popover} placement="bottom end" offset={6}>
        <Dialog className={styles.dialog} aria-label={label}>
          {children}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
