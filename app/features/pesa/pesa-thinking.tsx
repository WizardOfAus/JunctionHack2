'use client';
// Live progress while Pesä works: the current step with a shimmer, elapsed time, completed steps and sources.
import { useEffect, useState } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';
import type { ProgressState } from '@/lib/coach/progress';
import { PesaEgg } from './pesa-egg';
import styles from './pesa-thinking.module.css';

export function PesaThinking({ progress, startedAt }: { progress: ProgressState; startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const seconds = Math.max(0, Math.round((now - startedAt) / 1000));
  const current = [...progress.steps].reverse().find(step => !step.done);
  const done = progress.steps.filter(step => step.done);
  const label = progress.text ? 'Writing your answer' : current?.label ?? 'Thinking it through';
  return (
    <div className={styles.thinking} role="status" aria-live="polite">
      <PesaEgg state={progress.text ? 'answering' : 'thinking'} size={30} />
      <div className={styles.body}>
        <p className={styles.current}><span className={styles.shimmer}>{label}</span><span className={styles.time} aria-hidden="true">{seconds}s</span></p>
        {done.length ? (
          <details className={styles.steps}>
            <summary>{done.length} step{done.length === 1 ? '' : 's'} done<ChevronDown size={14} aria-hidden="true" /></summary>
            <ul>{done.map(step => <li key={step.id}><Check size={13} aria-hidden="true" />{step.label}</li>)}</ul>
          </details>
        ) : null}
        <SourceChips domains={progress.sources} />
      </div>
    </div>
  );
}

/** Public sources the coach read, as domain chips. Only domains are ever shown. */
export function SourceChips({ domains }: { domains: string[] }) {
  if (!domains.length) return null;
  return <ul className={styles.sources} aria-label="Public sources checked">{domains.map(domain => <li key={domain}><Globe size={12} aria-hidden="true" />{domain}</li>)}</ul>;
}
