'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ArrowUpRight, MessageCircle, X } from 'lucide-react';
import Link from 'next/link';
import styles from './coach-help.module.css';

export function CoachHelp({ open, onOpen, onClose, screen, children }: {
  open: boolean; onOpen: () => void; onClose: () => void; screen: string; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (open) {
      element?.showModal();
      element?.querySelector<HTMLInputElement>('#coach-question')?.focus();
    } else element?.close();
    return () => element?.close();
  }, [open]);

  return <>
    <button className={styles.launcher} onClick={onOpen} aria-haspopup="dialog" aria-expanded={open}><MessageCircle size={19}/>Ask Pesä</button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={headingId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <header className={styles.header}><div><h2 id={headingId}>Pesä</h2><p>Alongside {screen}</p></div><button className="icon-button" aria-label="Close Pesä" onClick={onClose}><X size={21}/></button></header>
      <div className={styles.body}>{open ? children : null}</div>
      <footer className={styles.footer}><Link href="/coach" onClick={onClose}>Open full conversation<ArrowUpRight size={15}/></Link></footer>
    </dialog>
  </>;
}
