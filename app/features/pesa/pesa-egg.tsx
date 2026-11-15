// Pesä, the coach: a small egg ("pesämuna" is Finnish for nest egg). Its state sets the expression and motion.
import { useId } from 'react';
import styles from './pesa-egg.module.css';

export type PesaState = 'idle' | 'listening' | 'thinking' | 'answering' | 'happy' | 'sleepy';

export function PesaEgg({ state = 'idle', size = 40, label = 'Pesä' }: { state?: PesaState; size?: number; label?: string }) {
  const closed = state === 'sleepy';
  // Each egg needs its own gradient id when several render on one page.
  const shell = `pesa-shell-${useId().replace(/:/g, '')}`;
  return (
    <span className={styles.egg} data-state={state} style={{ width: size, height: size * 1.1 }} role="img" aria-label={label}>
      <svg viewBox="0 0 64 70" aria-hidden="true">
        <defs>
          <radialGradient id={shell} cx="38%" cy="30%" r="75%">
            <stop offset="0" stopColor="#fffdf5" />
            <stop offset=".65" stopColor="#f6efd9" />
            <stop offset="1" stopColor="#e6dcbc" />
          </radialGradient>
        </defs>
        <ellipse className={styles.shadow} cx="32" cy="66" rx="17" ry="3" />
        <g className={styles.body}>
          <path d="M32 4C19 4 9 25 9 41c0 14 10 23 23 23s23-9 23-23C55 25 45 4 32 4Z" fill={`url(#${shell})`} stroke="#d8cca7" strokeWidth="1.2" />
          <ellipse cx="23" cy="20" rx="5" ry="8" fill="#fff" opacity=".55" transform="rotate(-20 23 20)" />
          <g className={styles.face}>
            {closed ? (
              <>
                <path d="M21 39q3 2 6 0M37 39q3 2 6 0" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" fill="none" />
              </>
            ) : (
              <g className={styles.eyes}>
                <ellipse cx="24" cy="38" rx="2.6" ry="3.3" fill="var(--ink)" />
                <ellipse cx="40" cy="38" rx="2.6" ry="3.3" fill="var(--ink)" />
                <circle cx="25" cy="37" r=".9" fill="#fff" />
                <circle cx="41" cy="37" r=".9" fill="#fff" />
              </g>
            )}
            <ellipse cx="18" cy="45" rx="3.4" ry="2" fill="#f4b9a0" opacity=".7" />
            <ellipse cx="46" cy="45" rx="3.4" ry="2" fill="#f4b9a0" opacity=".7" />
            <path className={styles.mouth} d={state === 'happy' ? 'M27 45q5 6 10 0' : state === 'thinking' ? 'M29 47h6' : 'M28 45q4 3.5 8 0'} stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" fill="none" />
          </g>
          {state === 'happy' ? <path className={styles.crack} d="M14 26l5 3 3-4 4 4 3-3" stroke="#c8b98c" strokeWidth="1.2" fill="none" strokeLinecap="round" /> : null}
        </g>
        {state === 'happy' ? (
          <g className={styles.sparkles} fill="#9cc65a">
            <path d="M6 12l1.5 3 3 1.5-3 1.5L6 21l-1.5-3-3-1.5 3-1.5Z" />
            <path d="M57 8l1 2 2 1-2 1-1 2-1-2-2-1 2-1Z" />
          </g>
        ) : null}
        {state === 'sleepy' ? <text className={styles.zzz} x="48" y="14" fontSize="10" fill="var(--muted)">z</text> : null}
      </svg>
    </span>
  );
}
