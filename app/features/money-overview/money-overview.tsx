'use client';

import { ArrowRight, ArrowUpRight, ChevronRight, Heart, Home, ShieldCheck, Utensils, Wallet } from 'lucide-react';
import { euro, type Basket, type Forecast } from '@/lib/finance';
import { goals, type GoalId } from '../onboarding/model';
import styles from './money-overview.module.css';

type Props = { forecast: Forecast; goal: GoalId; busy: boolean; failed: boolean; connected: boolean; lessonComplete: boolean; onLesson: () => void; onPlan: () => void; onCalculation: () => void; onSettings: () => void; onEvidence: (basket: Basket) => void };
const baskets = [
  { id: 'regular', title: 'Everyday essentials', detail: 'Housing, groceries & bills', icon: Home },
  { id: 'irregular', title: 'Life’s little surprises', detail: 'Health, transport & irregular needs', icon: Heart },
  { id: 'flexible', title: 'Your kind of everyday', detail: 'Restaurants, lifestyle & entertainment', icon: Utensils },
] as const;

export function MoneyOverview({ forecast: f, goal, busy, failed, connected, lessonComplete, onLesson, onPlan, onCalculation, onSettings, onEvidence }: Props) {
  const pending = busy || failed;
  const paused = f.blocked || !connected;
  const max = Math.max(f.balanceCents, f.minimumCents, f.protectedCents, 1);
  const rows = [
    { label: 'Recorded balance', value: f.balanceCents, className: styles.balance, explanation: 'What the account shows today' },
    { label: 'Lowest forecast', value: f.minimumCents, className: styles.forecast, explanation: `After projected income & outgoings over ${f.horizonDays} days` },
    { label: 'Protected reserve', value: f.protectedCents, className: styles.protected, explanation: 'Emergency & irregular-expense assumptions' },
  ];
  return <div className={styles.overview}>
    <section className={styles.money} aria-labelledby="money-title" aria-busy={busy}>
      <div className={styles.sectionTop}><h2 id="money-title">What’s really available?</h2><button className="text-button" onClick={onCalculation}>Follow the numbers<ArrowUpRight size={16}/></button></div>
      <div className={styles.room}>
        <div><span>Estimated extra room</span><strong>{pending ? '—' : paused ? 'Paused' : euro(f.remainingCents, 2)}</strong></div>
        <p>{failed ? 'The estimate couldn’t refresh. Retry above before using these numbers.' : busy ? 'Recalculating with your latest assumptions…' : paused ? 'Let’s check the assumptions before planning extra saving.' : 'A little room to choose. Everyday spending and your protected reserve are already accounted for.'}</p>
      </div>
      <div className={styles.bridge} aria-label="From account balance to extra room">{rows.map(row => <div className={styles.bridgeRow} key={row.label}><div className={styles.rowLabel}><span>{row.label}</span><strong>{pending || !connected ? '—' : euro(row.value, 2)}</strong></div><div className={styles.track} aria-hidden="true"><span className={row.className} style={{ width: `${pending || !connected ? 0 : Math.max(0, row.value) / max * 100}%` }}/></div><p>{row.explanation}</p></div>)}</div>
      {!pending && f.allocationCents > 0 ? <p className={styles.allocation}>{euro(f.allocationCents, 2)} is also set aside in your home scenario.</p> : null}
      {!pending && paused ? <div className={styles.pause} role="status"><ShieldCheck size={21}/><div><strong>Protection comes first.</strong><p>{f.warnings[0] || 'Reconnect your demo source to see the estimate.'}</p><button className="text-button" onClick={onSettings}>Review assumptions<ArrowRight size={16}/></button></div></div> : <div className={styles.moneyAction}><p>Forecast, not a guarantee.<br/><span>One synthetic account · 1 Sep 2026</span></p><button className="button" onClick={onPlan} disabled={pending}>{goals[goal].action}<ArrowRight size={17}/></button></div>}
    </section>
    <button className={styles.lessonInvite} onClick={onLesson}>
      <span className={styles.lessonDrawing} aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} className={i < 9 ? styles.cellBills : i < 14 ? styles.cellReserve : styles.cellRoom}/>)}</span>
      <span className={styles.inviteCopy}><strong>Same balance. Different possibilities.</strong><span>Try it in 2 minutes · {lessonComplete ? 'Progress saved' : '40 XP'}</span><span>Move the money. Discover why your balance isn’t all spending room.</span></span><ArrowRight size={23}/>
    </button>
    <section className={styles.spending} aria-labelledby="spending-title"><div className={styles.sectionTop}><h2 id="spending-title">Where everyday life goes</h2><span>Monthly average · Jun–Aug</span></div><div className={styles.basketBar} aria-hidden="true">{baskets.map(({ id }) => <span key={id} className={styles[id]} style={{ flex: f.baskets[id] || 1 }}/>)}</div>{baskets.map(({ id, title, detail, icon: Icon }) => <button className={styles.basket} key={id} onClick={() => onEvidence(id)} disabled={!connected || pending}><span className={`${styles.basketIcon} ${styles[id]}`}><Icon size={21}/></span><span className={styles.basketCopy}><strong>{title}</strong><span>{detail}</span></span><strong className={styles.amount}>{pending || !connected ? '—' : euro(f.baskets[id], 2)}</strong><ChevronRight size={17}/></button>)}<p className={styles.sourceNote}>Open a basket to inspect the source rows or change a classification.</p></section>
    <div className={styles.bottomNote}><Wallet size={18}/><span>Estimates use the supplied history through 31 August. You can inspect every assumption.</span></div>
  </div>;
}
