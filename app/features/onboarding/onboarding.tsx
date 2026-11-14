'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Home, ShieldCheck, Wallet } from 'lucide-react';
import { HISTORY_THROUGH, euro } from '@/lib/finance';
import { dateLabel } from '@/lib/date-labels';
import { goals, type GoalId } from './model';
import styles from './onboarding.module.css';

const icons = { understand: Wallet, buffer: ShieldCheck, home: Home };
type Props = { initialGoal?: GoalId; protectedCents: number; onFinish: (goal: GoalId, coverage: boolean) => void; onCancel?: () => void };

export function Onboarding({ initialGoal, protectedCents, onFinish, onCancel }: Props) {
  const [goal, setGoal] = useState<GoalId | null>(initialGoal ?? null);
  const [step, setStep] = useState(0);
  const [coverage, setCoverage] = useState<'assume' | 'unknown' | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }, [step]);

  return <div className={styles.page}>
    <header className={styles.header}><a href="/" aria-label="Koti home" className={styles.brand}><Home size={25} />koti.</a><span>Independent learning demo</span></header>
    <main className={styles.layout}>
      <div className={styles.introduction}>
        <h1>Good with money.<br /><span>On your terms.</span></h1>
        <p>A clearer picture today. A little more confidence for whatever comes next.</p>
        <div className={styles.moneyMap} aria-hidden="true"><div className={styles.mapTop}>Everyday life<Wallet size={24}/></div><div className={styles.mapMiddle}><ShieldCheck size={25}/><span>A little protection</span></div><div className={styles.mapBottom}><span>Room for what matters</span><ArrowRight size={26}/></div></div>
        <p className={styles.introNote}>Explore real patterns in a synthetic account. No bank connection or real money needed.</p>
      </div>
      <section className={styles.setup} aria-labelledby="setup-heading">
        <ol className={styles.steps} aria-label="Setup progress"><li aria-current={step === 0 ? 'step' : undefined}><span>{step > 0 ? <Check size={15}/> : '1'}</span>Your direction</li><li aria-current={step === 1 ? 'step' : undefined}><span>2</span>The demo</li></ol>
        {step === 0 ? <>
          <h2 id="setup-heading" ref={heading} tabIndex={-1}>What would you like to feel better about?</h2>
          <p>You can change your direction any time.</p>
          <fieldset className={styles.choices}><legend className="sr-only">Choose your starting goal</legend>{(Object.keys(goals) as GoalId[]).map(id => { const Icon = icons[id]; return <label key={id} className={`${styles.choice} ${goal === id ? styles.selected : ''}`}><input type="radio" name="journey-goal" value={id} checked={goal === id} onChange={() => setGoal(id)}/><Icon size={24}/><span><strong>{goals[id].title}</strong><span>{goals[id].description}</span></span><span className={styles.radio}>{goal === id ? <Check size={15}/> : null}</span></label>; })}</fieldset>
          <button className={`button ${styles.continue}`} disabled={!goal} onClick={() => setStep(1)}>Continue<ArrowRight size={18}/></button>
          <button className={styles.skip} onClick={() => { setGoal('understand'); setStep(1); }}>Just explore the demo</button>
          {onCancel ? <button className={styles.skip} onClick={onCancel}>Keep my current direction</button> : null}
        </> : <>
          <h2 id="setup-heading" ref={heading} tabIndex={-1}>Meet Alex’s demo account.</h2>
          <p>One synthetic person. Your choice of goal changes the journey, not the transactions.</p>
          <dl className={styles.facts}><div><dt>History available</dt><dd>Through {dateLabel(HISTORY_THROUGH)}</dd></div><div><dt>Source</dt><dd>Junction dataset · one account</dd></div><div><dt>Protected reserve</dt><dd>{euro(protectedCents, 2)} · editable assumption</dd></div></dl>
          <fieldset className={styles.coverage}><legend>Should we assume this covers all accounts and bills?</legend><label><input type="radio" name="coverage" checked={coverage === 'assume'} onChange={() => setCoverage('assume')}/><span>Yes, for this demo<small>Allow estimates using the supplied account.</small></span></label><label><input type="radio" name="coverage" checked={coverage === 'unknown'} onChange={() => setCoverage('unknown')}/><span>I don’t know<small>Explore and learn. Extra saving estimates stay paused.</small></span></label></fieldset>
          <p className={styles.disclosure}>Your goal and learning progress stay in this browser. XP is a learning reward with no cash value.</p>
          <button className={`button ${styles.continue}`} disabled={!coverage} onClick={() => { if (goal && coverage) onFinish(goal, coverage === 'assume'); }}>Open my workspace<ArrowRight size={18}/></button>
          <button className={styles.skip} onClick={() => setStep(0)}><ArrowLeft size={16}/>Back to my direction</button>
        </>}
      </section>
    </main>
  </div>;
}
