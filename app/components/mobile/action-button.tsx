'use client';

import type { ComponentProps } from 'react';
import styles from './mobile.module.css';

export type ActionButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'quiet';
  busy?: boolean;
  busyLabel?: string;
};

export function ActionButton({ variant = 'primary', busy = false, busyLabel = 'Working…', disabled, className, children, type = 'button', ...props }: ActionButtonProps) {
  return <button {...props} type={type} className={[styles.action, styles[variant], className].filter(Boolean).join(' ')} disabled={disabled || busy} aria-busy={busy || undefined}>
    {busy ? busyLabel : children}
  </button>;
}
