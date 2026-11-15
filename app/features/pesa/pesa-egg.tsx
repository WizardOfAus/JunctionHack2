// Pesä, the coach: a small egg with a sprout ("pesämuna" is Finnish for nest egg, and it grows).
// Its state sets the expression and motion. At small sizes it sits on a soft badge so it reads on paper.
import { useId } from 'react';
import styles from './pesa-egg.module.css';

export type PesaState = 'idle' | 'listening' | 'thinking' | 'answering' | 'happy' | 'sleepy';

export function PesaEgg({ state = 'idle', size = 40, label = 'Pesä', badge = size <= 40 }: { state?: PesaState; size?: number; label?: string; badge?: boolean }) {
  const closed = state === 'sleepy';
  // Each egg needs its own gradient id when several render on one page.
  const shell = `pesa-shell-${useId().replace(/:/g, '')}`;
  return (
    <span className={`${styles.egg} ${badge ? styles.badge : ''}`} data-state={state} style={{ width: size, height: size }} role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true}>
      <svg viewBox="0 0 64 70" aria-hidden="true">
        <defs>
          <radialGradient id={shell} cx="36%" cy="30%" r="78%">
            <stop offset="0" stopColor="#fffefa" />
            <stop offset=".6" stopColor="#f7efd8" />
            <stop offset="1" stopColor="#e8dbb4" />
          </radialGradient>
        </defs>
        <ellipse className={styles.shadow} cx="32" cy="66" rx="16" ry="2.6" />
        <g className={styles.body}>
          {/* The sprout: the nest egg is growing. */}
          <g className={styles.sprout}>
            <path d="M32 13V6" stroke="#387c36" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M32 8c-1-4-5-6-9-5 1 4 5 6 9 5Z" fill="#387c36" />
            <path d="M32 7c1.5-4 5.5-5.5 9-4-1.5 4-5.5 5.5-9 4Z" fill="#6aa84f" />
          </g>
          <path d="M32 11C20 11 11 29 11 43c0 12.5 9 21 21 21s21-8.5 21-21C53 29 44 11 32 11Z" fill={`url(#${shell})`} stroke="#b4a370" strokeWidth="1.8" />
          <ellipse cx="24" cy="25" rx="4.2" ry="6.5" fill="#fff" opacity=".7" transform="rotate(-20 24 25)" />
          <g className={styles.face}>
            {closed
              ? <path d="M21.5 41q3.5 2.5 7 0M35.5 41q3.5 2.5 7 0" stroke="#203d31" strokeWidth="2.4" strokeLinecap="round" fill="none" />
              : <g className={styles.eyes}>
                  <ellipse cx="25" cy="40" rx="3.1" ry="3.9" fill="#203d31" />
                  <ellipse cx="39" cy="40" rx="3.1" ry="3.9" fill="#203d31" />
                  <circle cx="26.2" cy="38.6" r="1.1" fill="#fff" />
                  <circle cx="40.2" cy="38.6" r="1.1" fill="#fff" />
                </g>}
            <ellipse cx="19" cy="47.5" rx="3.6" ry="2.2" fill="#f2a98c" opacity=".75" />
            <ellipse cx="45" cy="47.5" rx="3.6" ry="2.2" fill="#f2a98c" opacity=".75" />
            <path className={styles.mouth} d={state === 'happy' ? 'M27.5 47q4.5 5.5 9 0' : state === 'thinking' ? 'M29.5 49h5' : 'M28.5 47q3.5 3.2 7 0'} stroke="#203d31" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          </g>
          {state === 'happy' ? <path className={styles.crack} d="M15 30l5 3 3-4 4 4 3-3" stroke="#b4a370" strokeWidth="1.4" fill="none" strokeLinecap="round" /> : null}
        </g>
        {state === 'happy' ? (
          <g className={styles.sparkles} fill="#6aa84f">
            <path d="M6 14l1.5 3 3 1.5-3 1.5L6 23l-1.5-3-3-1.5 3-1.5Z" />
            <path d="M57 10l1 2 2 1-2 1-1 2-1-2-2-1 2-1Z" />
          </g>
        ) : null}
        {state === 'sleepy' ? <text className={styles.zzz} x="49" y="18" fontSize="10" fill="#617064">z</text> : null}
      </svg>
    </span>
  );
}
