import type {ReactNode} from 'react';
import {CheckCircle, Info, Warning, XCircle} from '@phosphor-icons/react';
import styles from './StatusMessage.module.css';

export type StatusTone = 'info' | 'success' | 'warning' | 'error';

export interface StatusMessageProps {
  tone: StatusTone;
  children: ReactNode;
  title?: string;
  className?: string;
}

const toneIcons = {
  info: Info,
  success: CheckCircle,
  warning: Warning,
  error: XCircle,
};

export function StatusMessage({tone, children, title, className}: StatusMessageProps) {
  const Icon = toneIcons[tone];
  const isError = tone === 'error';

  return (
    <div
      className={`${styles.message} ${styles[tone]}${className ? ` ${className}` : ''}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
    >
      <Icon className={styles.icon} aria-hidden="true" weight="regular" />
      <div className={styles.content}>
        {title && <strong className={styles.title}>{title}</strong>}
        <div>{children}</div>
      </div>
    </div>
  );
}
