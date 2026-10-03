import type {ReactNode} from 'react';
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  Heading,
  Modal,
  ModalOverlay,
  Text,
} from 'react-aria-components';
import {X} from '@phosphor-icons/react';
import styles from './Dialog.module.css';

export interface DialogControls {
  close(): void;
}

export interface DialogProps {
  isOpen: boolean;
  onOpenChange(isOpen: boolean): void;
  title: string;
  children: ReactNode | ((controls: DialogControls) => ReactNode);
  description?: string;
  isDismissable?: boolean;
  className?: string;
}

export function Dialog({
  isOpen,
  onOpenChange,
  title,
  children,
  description,
  isDismissable = true,
  className,
}: DialogProps) {
  return (
    <ModalOverlay
      className={styles.overlay}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={isDismissable}
    >
      <Modal className={styles.modal}>
        <AriaDialog className={`${styles.dialog}${className ? ` ${className}` : ''}`}>
          {({close}) => (
            <>
              <header className={styles.header}>
                <div className={styles.headingBlock}>
                  <Heading className={styles.title} level={2} slot="title">{title}</Heading>
                  {description && <Text className={styles.description} slot="description">{description}</Text>}
                </div>
                <AriaButton className={styles.closeButton} aria-label="Fechar" onPress={close}>
                  <X aria-hidden="true" weight="bold" />
                </AriaButton>
              </header>
              <div className={styles.content}>
                {typeof children === 'function' ? children({close}) : children}
              </div>
            </>
          )}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}
