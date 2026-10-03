import type {ReactNode} from 'react';
import {Button as AriaButton, Disclosure as AriaDisclosure, DisclosurePanel, Heading} from 'react-aria-components';
import {CaretRight} from '@phosphor-icons/react';
import styles from './Disclosure.module.css';

export interface DisclosureProps {
  title: string;
  children: ReactNode;
  isExpanded: boolean;
  onExpandedChange(isExpanded: boolean): void;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  isDisabled?: boolean;
  className?: string;
}

export function Disclosure({
  title,
  children,
  isExpanded,
  onExpandedChange,
  headingLevel = 2,
  isDisabled = false,
  className,
}: DisclosureProps) {
  return (
    <AriaDisclosure
      className={`${styles.root}${className ? ` ${className}` : ''}`}
      isExpanded={isExpanded}
      onExpandedChange={onExpandedChange}
      isDisabled={isDisabled}
    >
      <Heading className={styles.heading} level={headingLevel}>
        <AriaButton className={styles.trigger} slot="trigger">
          <CaretRight className={styles.indicator} aria-hidden="true" weight="bold" />
          <span>{title}</span>
        </AriaButton>
      </Heading>
      <DisclosurePanel className={styles.panel}>{children}</DisclosurePanel>
    </AriaDisclosure>
  );
}
