import {Button as AriaButton, type ButtonProps as AriaButtonProps} from 'react-aria-components';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';

export interface ButtonProps extends Omit<AriaButtonProps, 'className'> {
  variant?: ButtonVariant;
  className?: string;
}

export function Button({variant = 'secondary', className, ...props}: ButtonProps) {
  return <AriaButton {...props} className={`${styles.button} ${styles[variant]}${className ? ` ${className}` : ''}`} />;
}
