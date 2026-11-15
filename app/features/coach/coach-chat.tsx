'use client';
// The coach conversation: a centred column, a large composer and live progress while Pesä works.
// The shell passes the actions it owns (source rows, lessons, plan previews, answer visuals).
import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { ArrowRight, ArrowUp, ArrowUpRight, Calculator, Sparkles, Square } from 'lucide-react';
import type { CoachAction } from '@/lib/journey/context';
import { PesaEgg } from '@/features/pesa/pesa-egg';
import { PesaThinking, SourceChips } from '@/features/pesa/pesa-thinking';
import type { CoachMessage, useCoachChat } from './use-coach-chat';
import styles from './coach-chat.module.css';

type Props = {
  chat: ReturnType<typeof useCoachChat>;
  variant?: 'page' | 'sheet';
  suggestions: string[];
  dataThrough: string;
  scopeKey: string;
  disabled?: boolean;
  inputRef?: Ref<HTMLTextAreaElement>;
  renderVisual?: (message: CoachMessage) => ReactNode | null;
  onEvidence: (message: CoachMessage) => void;
  onAction: (action: CoachAction) => void;
  actionLabel: (action: CoachAction) => string;
  actionDisabled: (action: CoachAction, message: CoachMessage) => boolean;
  /** Shown under the suggestions, e.g. the memory panel. */
  memory?: ReactNode;
  /** Saves a confirmed "remember …" request; resolves true when saved. */
  onRemember?: (text: string) => Promise<boolean>;
};

const paragraphs = (text: string) => text.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>);

export function CoachChat({ chat, variant = 'page', suggestions, dataThrough, scopeKey, disabled, inputRef, renderVisual, onEvidence, onAction, actionLabel, actionDisabled, memory, onRemember }: Props) {
  const inputId = useId();
  const [draft, setDraft] = useState('');
  const [remembered, setRemembered] = useState<Record<number, 'saved' | 'failed'>>({});
  const end = useRef<HTMLDivElement>(null);
  const empty = !chat.messages.length && !chat.busy;
  const streaming = chat.progress.text.length > 0;
  useEffect(() => { if (!empty) end.current?.scrollIntoView({ block: 'end', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }, [chat.messages.length, chat.busy, streaming, empty]);
  const send = (text: string) => { if (!text.trim() || chat.busy || disabled) return; setDraft(''); void chat.ask(text); };

  const composer = (
    <form className={styles.composer} onSubmit={e => { e.preventDefault(); send(draft); }}>
      <label className="sr-only" htmlFor={inputId}>Ask Pesä a money question</label>
      <textarea id={inputId} ref={inputRef} rows={1} maxLength={1500} value={draft} placeholder="Ask Pesä about your money…" disabled={disabled}
        onChange={e => { setDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`; }}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(draft); } }} />
      {chat.busy
        ? <button type="button" className={styles.send} onClick={chat.cancel} aria-label="Stop the answer"><Square size={14} fill="currentColor" /></button>
        : <button type="submit" className={styles.send} disabled={!draft.trim() || disabled} aria-label="Send question"><ArrowUp size={19} /></button>}
    </form>
  );

  if (empty) return (
    <section className={`${styles.chat} ${styles.empty}`} data-variant={variant}>
      <PesaEgg state={draft ? 'listening' : 'idle'} size={variant === 'page' ? 68 : 52} />
      <h2>Hei! What should we look at?</h2>
      <p className={styles.lead}>I read your account through {dataThrough} and calculate from your actual transactions.</p>
      {composer}
      <div className={styles.suggestions}>{suggestions.map(s => <button key={s} onClick={() => send(s)} disabled={disabled}>{s}<ArrowUpRight size={15} aria-hidden="true" /></button>)}</div>
      {memory}
    </section>
  );

  return (
    <section className={styles.chat} data-variant={variant}>
      <div className={styles.thread} aria-live="polite">
        {chat.messages.map((m, i) => m.role === 'user'
          ? <div key={i} className={styles.user}><p>{m.text}</p></div>
          : <div key={i} className={styles.coach}>
              <PesaEgg state={m.agentUnavailable ? 'sleepy' : 'idle'} size={26} />
              <div className={styles.answer}>
                {renderVisual?.(m) ?? paragraphs(m.text)}
                {m.kind !== 'error' ? <div className={styles.meta}>
                  <span className={styles.badge}>{m.mode === 'agent' ? <><Sparkles size={12} aria-hidden="true" />AI coach</> : <><Calculator size={12} aria-hidden="true" />Calculated</>}</span>
                  {m.evidence?.length ? <button className={styles.link} onClick={() => onEvidence(m)}>Inspect {m.evidence.length} source row{m.evidence.length === 1 ? '' : 's'}<ArrowUpRight size={13} aria-hidden="true" /></button> : null}
                </div> : null}
                <SourceChips domains={m.mode === 'agent' ? m.sources ?? [] : []} />
                {m.source ? <small className={styles.note}>{[m.source.dataset, m.source.customerLabel].filter(Boolean).join(' · ')}</small> : null}
                {m.rememberSuggestion && onRemember && m.scope===scopeKey ? <div className={styles.actions}>{remembered[i] === 'saved'
                  ? <span className={styles.badge}>Saved to what Pesä knows</span>
                  : <button onClick={async () => { const ok = await onRemember(m.rememberSuggestion!); setRemembered(r => ({ ...r, [i]: ok ? 'saved' : 'failed' })); }}>{remembered[i] === 'failed' ? 'Try again' : 'Remember this'}<ArrowRight size={13} aria-hidden="true" /></button>}</div> : null}
                {m.actions?.length ? <div className={styles.actions}>{m.actions.map((action, j) =>
                  <button key={j} disabled={actionDisabled(action, m)} onClick={() => onAction(action)}>{actionLabel(action)}<ArrowRight size={13} aria-hidden="true" /></button>)}</div> : null}
                {m.actions?.some(a => a.type === 'preview') && m.scope !== scopeKey ? <small className={styles.stale}>Your plan or learning changed. Ask again for an updated suggestion.</small> : null}
              </div>
            </div>)}
        {chat.busy ? <div className={styles.coach}>
          {chat.progress.text
            ? <><PesaEgg state="answering" size={26} /><div className={`${styles.answer} ${styles.streaming}`}>{paragraphs(chat.progress.text)}<SourceChips domains={chat.progress.sources} /></div></>
            : <PesaThinking progress={chat.progress} startedAt={chat.startedAt} />}
        </div> : null}
        <div ref={end} />
      </div>
      <div className={styles.dock}>{composer}<p className={styles.note}>Pesä explains; the app calculates every figure. Not financial advice.</p></div>
    </section>
  );
}
