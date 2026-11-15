'use client';

import { useId, useRef, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';
import { Drawer } from 'vaul';
import { ActionButton } from './action-button';
import styles from './mobile.module.css';

export type ResponsiveSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

const motionQuery = '(prefers-reduced-motion: reduce)';
function subscribeMotion(notify: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
}
const readMotion = () => window.matchMedia(motionQuery).matches;
const serverMotion = () => true;

/** A dismissible preview surface. Applying a change is always the consumer's explicit action. */
export function ResponsiveSheet({ open, onOpenChange, title, description, children, footer, initialFocusRef, returnFocusRef }: ResponsiveSheetProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const descriptionId = useId();
  const opener = useRef<HTMLElement | null>(null);
  const reducedMotion = useSyncExternalStore(subscribeMotion, readMotion, serverMotion);

  return <Drawer.Root open={open} onOpenChange={onOpenChange} handleOnly fixed repositionInputs shouldScaleBackground={false} autoFocus>
    <Drawer.Portal>
      <Drawer.Overlay className={styles.overlay} />
      <Drawer.Content className={styles.sheet} aria-describedby={description ? descriptionId : undefined}
        onOpenAutoFocus={event => {
          event.preventDefault();
          opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          (initialFocusRef?.current ?? heading.current)?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          const target = returnFocusRef?.current ?? opener.current;
          if (target?.isConnected) target.focus({ preventScroll: true });
        }}>
        {!reducedMotion && <Drawer.Handle className={styles.handle} aria-hidden="true" preventCycle />}
        <header className={styles.sheetHeader}>
          <div>
            <Drawer.Title ref={heading} tabIndex={-1} className={styles.sheetTitle}>{title}</Drawer.Title>
          </div>
          <Drawer.Close asChild><ActionButton variant="quiet" className={styles.close} aria-label={`Close ${title}`}><X size={20} aria-hidden="true" /></ActionButton></Drawer.Close>
        </header>
        <div className={styles.sheetBody}>
          {description && <Drawer.Description id={descriptionId} className={styles.description}>{description}</Drawer.Description>}
          {children}
        </div>
        {footer && <footer className={styles.sheetFooter}>{footer}</footer>}
      </Drawer.Content>
    </Drawer.Portal>
  </Drawer.Root>;
}
