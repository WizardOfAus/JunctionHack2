'use client';
// Learn with Pesä: a short daily feed of cards built from the person's own numbers.
// Mastery decides what comes next; it is kept in this browser per demo persona.
import { useState, useSyncExternalStore } from 'react';
import { ArrowRight, ArrowUpRight, Check, MessageCircle, Sparkles } from 'lucide-react';
import type { Forecast } from '@/lib/finance';
import type { Benchmarks } from '@/lib/benchmarks';
import type { LoanReadiness } from '@/lib/loan-readiness';
import { buildFeed, closeEnough, concepts, masteredCount, updateMastery, MASTERED, type Card, type ConceptId, type Goal, type Mastery } from '@/lib/learning/feed';
import { PesaEgg } from '@/features/pesa/pesa-egg';
import styles from './learn-feed.module.css';

const storageKey = (personaId: string) => `koti-mastery:${personaId}`;
function loadMastery(personaId: string): Mastery { try { return JSON.parse(localStorage.getItem(storageKey(personaId)) ?? '{}') as Mastery; } catch { return {}; } }
function saveMastery(personaId: string, m: Mastery) { try { localStorage.setItem(storageKey(personaId), JSON.stringify(m)); } catch { /* storage unavailable */ } }

type Props = { personaId: string; goal: Goal; forecast: Forecast; comparison: Benchmarks | null; readiness: LoanReadiness | null; format: (cents: number) => string; unavailable?: boolean; onAsk: (question: string) => void };

const noop = () => () => {};
/** Mastery lives in browser storage, so the feed renders only after hydration. */
export function LearnFeed(props: Props) {
  const client = useSyncExternalStore(noop, () => true, () => false);
  return client ? <Feed {...props} /> : <section className={styles.learn}><header className={styles.header}><div><h2>Learn with Pesä</h2><p>Short cards built from your own numbers.</p></div></header></section>;
}

function Feed(props: Props) {
  const { personaId, format, onAsk } = props;
  const [mastery, setMastery] = useState<Mastery>(() => loadMastery(personaId));
  // The feed is fixed for this visit, so answering a card never reshuffles the ones ahead.
  const [feed] = useState(() => buildFeed({ ...props, mastery: loadMastery(personaId) }));
  const [index, setIndex] = useState(0);
  const [topic, setTopic] = useState('');
  const record = (conceptId: ConceptId, correct: boolean) => setMastery(m => { const next = updateMastery(m, conceptId, correct); saveMastery(personaId, next); return next; });
  const card = feed[index], done = index >= feed.length;

  return (
    <section className={styles.learn} aria-labelledby="learn-title">
      <header className={styles.header}>
        <div><h2 id="learn-title">Learn with Pesä</h2><p>Short cards built from your own numbers.</p></div>
        <div className={styles.mastery} aria-label={`${masteredCount(mastery)} of 8 topics mastered`}>
          {(Object.keys(concepts) as ConceptId[]).map(id => <span key={id} title={`${concepts[id]}: ${mastery[id]?.box ?? 0}/${MASTERED}`} style={{ ['--fill' as string]: `${((mastery[id]?.box ?? 0) / MASTERED) * 100}%` }} />)}
          <small>{masteredCount(mastery)}/8</small>
        </div>
      </header>
      {props.unavailable ? <p className={styles.note}>Learning cards pause while your figures update.</p> : done ? (
        <div className={`${styles.card} ${styles.done}`}>
          <PesaEgg state="happy" size={60} />
          <h3>That’s today’s learning</h3>
          <p>{masteredCount(mastery)} of 8 topics mastered. Come back tomorrow, or ask Pesä to teach you something new.</p>
          <form className={styles.teach} onSubmit={e => { e.preventDefault(); if (topic.trim()) onAsk(`Teach me about ${topic.trim()} in three short steps, using my own numbers where you can.`); }}>
            <label className="sr-only" htmlFor="teach-topic">Teach me about</label>
            <input id="teach-topic" value={topic} maxLength={120} placeholder="Teach me about… (e.g. interest rates)" onChange={e => setTopic(e.target.value)} />
            <button type="submit" disabled={!topic.trim()} aria-label="Ask Pesä to teach this"><Sparkles size={16} /></button>
          </form>
        </div>
      ) : (
        <div className={styles.stack}>
          {feed[index + 1] ? <div className={styles.peek} aria-hidden="true" /> : null}
          <CardView key={card.id} card={card} format={format} onResult={correct => record(card.conceptId, correct)} onNext={() => setIndex(i => i + 1)} onAsk={() => onAsk(`Explain “${card.title}” using my numbers.`)} />
          <div className={styles.dots} aria-label={`Card ${index + 1} of ${feed.length}`}>{feed.map((c, i) => <span key={c.id} data-state={i < index ? 'done' : i === index ? 'current' : 'next'} />)}</div>
        </div>
      )}
    </section>
  );
}

function CardView({ card, format, onResult, onNext, onAsk }: { card: Card; format: (c: number) => string; onResult: (correct: boolean) => void; onNext: () => void; onAsk: () => void }) {
  const [guess, setGuess] = useState(card.kind === 'predict' ? Math.round(card.maxCents / 2 / 500) * 500 : 0);
  const [answer, setAnswer] = useState<string | null>(null);
  const answered = answer !== null;
  const correct = card.kind === 'predict' ? answered && closeEnough(guess, card.answerCents) : card.kind === 'quiz' ? card.options.find(o => o.label === answer)?.correct ?? false : true;
  const finish = (value: string, isCorrect: boolean) => { setAnswer(value); onResult(isCorrect); };
  return (
    <article className={styles.card}>
      <span className={styles.kicker}>{card.kind === 'predict' ? 'Guess, then reveal' : card.kind === 'quiz' ? 'Quick check' : 'Good to know'} · {concepts[card.conceptId]}</span>
      <h3>{card.title}</h3>
      {card.kind === 'concept' ? <><p>{card.body}</p><a className={styles.source} href={card.sourceUrl} target="_blank" rel="noreferrer">{card.source}<ArrowUpRight size={13} /></a></> : <p>{card.prompt}</p>}
      {card.kind === 'predict' ? (!answered ? <div className={styles.guess}>
          <output>{format(guess)}</output>
          <input type="range" min={0} max={card.maxCents} step={500} value={guess} onChange={e => setGuess(Number(e.target.value))} aria-label="Your guess" />
          <button className="button" onClick={() => finish(String(guess), closeEnough(guess, card.answerCents))}>Reveal</button>
        </div> : <div className={styles.reveal}>
          <Bar label="Your guess" cents={guess} max={Math.max(card.maxCents, guess)} format={format} />
          <Bar label="Your real figure" cents={card.answerCents} max={Math.max(card.maxCents, guess)} format={format} real />
        </div>) : null}
      {card.kind === 'quiz' ? <div className={styles.options}>{card.options.map(o => (
        <button key={o.label} disabled={answered} data-state={!answered ? undefined : o.correct ? 'right' : o.label === answer ? 'wrong' : undefined} onClick={() => finish(o.label, o.correct)}>
          {o.label}{answered && o.correct ? <Check size={15} /> : null}</button>))}</div> : null}
      {answered || card.kind === 'concept' ? <div className={styles.feedback} data-correct={card.kind === 'concept' ? undefined : correct}>
        {card.kind !== 'concept' ? <strong>{correct ? (card.kind === 'predict' ? 'Close!' : 'That’s right.') : 'Not quite.'}</strong> : null}
        {card.kind !== 'concept' ? <p>{card.explain}</p> : null}
      </div> : null}
      <footer className={styles.footer}>
        <button className={styles.ask} onClick={onAsk}><MessageCircle size={14} />Ask Pesä about this</button>
        {card.kind === 'concept' ? <button className="button" onClick={() => { onResult(true); onNext(); }}>Got it<ArrowRight size={16} /></button>
          : answered ? <button className="button" onClick={onNext}>Next<ArrowRight size={16} /></button> : null}
      </footer>
    </article>
  );
}

function Bar({ label, cents, max, format, real }: { label: string; cents: number; max: number; format: (c: number) => string; real?: boolean }) {
  return <div className={styles.bar} data-real={real}><span>{label}</span><div><i style={{ width: `${max ? Math.min(100, cents / max * 100) : 0}%` }} /></div><strong>{format(cents)}</strong></div>;
}
