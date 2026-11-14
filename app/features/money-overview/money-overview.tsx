'use client';

import { useState } from 'react';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Check, ChevronRight, Heart, Home, Info, ShieldCheck, SlidersHorizontal, Utensils, Wallet, X } from 'lucide-react';
import { euro, type Assumptions, type Basket, type Forecast } from '@/lib/finance';
import { goals, type GoalId } from '../onboarding/model';
import { CashflowTimeline } from '../money-insights/cashflow-timeline';
import { ScenarioDialog } from '../money-insights/scenario-dialog';
import { analysisPeriod, dateLabel, outlook } from '../money-insights/model';
import styles from './money-overview.module.css';

type Props = { forecast: Forecast; goal: GoalId; busy: boolean; failed: boolean; connected: boolean; lessonComplete: boolean; onLesson: () => void; onPlan: () => void; onCalculation: () => void; onSettings: () => void; onEvidence: (basket: Basket) => void; assumptions?: Assumptions; onApplyScenario?: (patch: Partial<Assumptions>) => void; onCoach?: (question: string) => void };
const baskets = [
  { id: 'regular', title: 'Everyday essentials', detail: 'Housing, groceries & regular bills', icon: Home },
  { id: 'flexible', title: 'Flexible everyday', detail: 'Spending you can review and adjust', icon: Utensils },
  { id: 'irregular', title: 'Irregular essentials', detail: 'Less frequent costs and larger needs', icon: Heart },
] as const;

export function MoneyOverview({ forecast: f, goal, busy, failed, connected, lessonComplete, onLesson, onPlan, onCalculation, onSettings, onEvidence, assumptions, onApplyScenario, onCoach }: Props) {
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [selectedBasket, setSelectedBasket] = useState<Basket | null>(null);
  const [dismissed, setDismissed] = useState('');
  const pending = busy || failed;
  const paused = f.blocked || !connected;
  const unavailable = pending || paused;
  const signal = outlook(f);
  const period = analysisPeriod(f);
  const total = Object.values(f.baskets).reduce((sum, value) => sum + value, 0);
  const incomeDay = f.points.find(point => point.incomeCents > 0);
  const recommendationKey = `${goal}:${lessonComplete}:${signal.kind}:${f.asOf}`;
  const recommendation = !lessonComplete
    ? { title: 'Why isn’t the whole balance available?', text: 'See how bills and a reserve change what is left to choose with.', action: 'Explore in 2 minutes', why: 'You haven’t completed the balance exercise yet. It explains the same balance, forecast and reserve shown here.' }
    : goal === 'buffer'
      ? { title: 'Try your buffer against a surprise.', text: 'Explore an unexpected cost and see how your reserve holds up.', action: 'Try a scenario', why: 'Your chosen direction is building a safety net. This exercise uses your current reserve and projected cash flow.' }
      : goal === 'home'
        ? { title: 'Make space for your next chapter.', text: 'Explore how a change affects your cash before adjusting your home plan.', action: 'Try a scenario', why: 'Your chosen direction is a first home. The preview keeps everyday costs and your reserve visible alongside that goal.' }
        : { title: 'See what a different month could look like.', text: 'Try a later payday or a change in spending. Keep the parts that work for you.', action: 'Try a scenario', why: 'Your chosen direction is understanding your money, and you have completed the balance exercise.' };
  const openScenario = () => { if (assumptions && onApplyScenario) setScenarioOpen(true); else onPlan(); };

  const briefing = <section className={styles.briefing} aria-label="Your money outlook" aria-busy={busy}>
      <span className={`${styles.signalIcon} ${signal.kind === 'attention' ? styles.attentionIcon : ''}`}><ShieldCheck size={21}/></span>
      <div><strong>{failed ? 'Your outlook needs a refresh.' : busy ? 'Updating your money outlook…' : !connected ? 'Your demo source is disconnected.' : signal.title}</strong><p hidden={!unavailable && signal.kind !== 'attention'}>{failed ? 'Retry the update above. Previous estimates stay hidden until the refresh succeeds.' : busy ? 'Checking the forecast against your latest assumptions.' : !connected ? 'Reconnect it to explore your money and inspect the source.' : signal.detail}</p></div>
      <button className="text-button" disabled={pending} onClick={paused ? onSettings : onCalculation}>{paused ? 'Review data' : 'Why this?'}<ArrowUpRight size={16}/></button>
    </section>;

  return <div className={styles.overview}>
    <div className={styles.heading}><div><h1>Your money</h1></div><span className={styles.datePill}><CalendarDays size={15}/>{dateLabel(f.asOf, true)} · demo</span></div>
    <div className={styles.contextRow}><span><span className={styles.sourceDot}/>One synthetic account · history through {dateLabel(f.dataThrough)}</span><button className="text-button" onClick={onSettings}><SlidersHorizontal size={15}/>Your assumptions</button></div>
    {failed || paused || signal.kind === 'attention' ? briefing : null}
    <div className={styles.outlookGrid}>
      <section className={styles.hero} aria-labelledby="money-title" aria-busy={busy}>
        <div className={styles.heroLabel}><Wallet size={18}/><span>{f.horizonDays}-day estimate</span></div>
        <h2 id="money-title">Estimated extra room</h2><strong className={styles.heroAmount}>{pending ? '—' : paused ? 'Paused' : euro(f.remainingCents, 2)}</strong>
        <p className={styles.heroDescription}>{paused ? 'Confirm the picture before making a new plan.' : 'After outgoings, reserve and home allocation. An estimate, not a spending target.'}</p>
        <dl className={styles.balanceBreakdown}><div><dt>Recorded balance</dt><dd>{pending || !connected ? '—' : euro(f.balanceCents, 2)}</dd></div><div><dt>Lowest projected balance</dt><dd>{unavailable ? '—' : euro(f.minimumCents, 2)}</dd></div><div><dt>Protected reserve</dt><dd>{pending || !connected ? '—' : euro(f.protectedCents, 2)}</dd></div>{f.allocationCents > 0 && !unavailable ? <div><dt>Home scenario allocation</dt><dd>{euro(f.allocationCents, 2)}</dd></div> : null}</dl>
        <button className={styles.heroAction} disabled={pending} onClick={paused ? onSettings : openScenario}>{paused ? 'Review your assumptions' : 'Explore a what-if'}<ArrowRight size={18}/></button><button className={styles.heroSecondary} onClick={onCalculation} disabled={unavailable}>How is this calculated?</button>
      </section>
      <section className={styles.chartCard} aria-label="Cash-flow forecast">{unavailable ? <div className={styles.chartEmpty}><ShieldCheck size={30}/><h2>{failed ? 'Your forecast couldn’t refresh' : busy ? 'Your forecast is updating' : 'Your forecast is paused'}</h2><p hidden={!unavailable && signal.kind !== 'attention'}>{failed ? 'The update could not complete. Retry before using the forecast.' : busy ? 'The timeline will return with your updated numbers.' : 'Review the source and account coverage to see the projected timeline.'}</p>{!pending && <button className="button secondary" onClick={onSettings}>Review assumptions<ArrowRight size={16}/></button>}</div> : <CashflowTimeline forecast={f}/>}</section>
    </div>
    {!unavailable && signal.kind !== 'attention' ? briefing : null}
    <div className={styles.snapshot} aria-label="Money snapshot"><div><span><ArrowDownLeft size={17}/>Typical monthly salary</span><strong>{pending || !connected ? '—' : euro(f.salaryCents)}</strong><small>Median used by the forecast</small></div><div><span><Wallet size={17}/>Average monthly spending</span><strong>{pending || !connected ? '—' : euro(f.consumptionCents)}</strong><small>{period} · excludes saving transfers</small></div><div><span><CalendarDays size={17}/>Next expected income</span><strong>{unavailable ? '—' : incomeDay ? dateLabel(incomeDay.date) : 'Outside this outlook'}</strong><small>Estimated timing · can change</small></div></div>
    <div className={styles.detailGrid}>
      <section className={styles.spending} aria-labelledby="spending-title"><div className={styles.sectionHeading}><div><h2 id="spending-title">Where your money goes</h2></div><span className={styles.smallTag}>Monthly average</span></div><p className={styles.supporting}>{period} · select a group to explore</p>
        <div className={styles.basketBar} aria-label="Spending group proportions">{baskets.map(({ id, title }) => <span key={id} title={title} className={styles[id]} style={{ width: `${!pending && connected && total > 0 ? f.baskets[id] / total * 100 : 0}%` }}/>)}</div>
        {baskets.map(({ id, title, detail, icon: Icon }) => <div key={id}><button className={styles.basket} disabled={pending || !connected} onClick={() => setSelectedBasket(selectedBasket === id ? null : id)} aria-expanded={selectedBasket === id} aria-controls={`basket-${id}`}><span className={`${styles.basketIcon} ${styles[id]}`}><Icon size={20}/></span><span className={styles.basketCopy}><strong>{title}</strong><span>{detail}</span></span><span className={styles.basketAmount}><strong>{pending || !connected ? '—' : euro(f.baskets[id], 2)}</strong><small>{pending || !connected ? '—' : `${total ? Math.round(f.baskets[id] / total * 100) : 0}% of spending`}</small></span><ChevronRight size={17} className={selectedBasket === id ? styles.expandedChevron : ''}/></button>{selectedBasket === id && !pending && connected ? <div id={`basket-${id}`} className={styles.basketDetail}><p>{id === 'regular' ? 'Recurring essentials. Open the transactions to review or correct a classification.' : id === 'irregular' ? 'Less frequent essentials in your history. A zero average doesn’t rule out future unexpected costs.' : 'Flexible doesn’t mean unnecessary. Review the transactions and decide what matters to you.'}</p><button className="text-button" onClick={() => onEvidence(id)}>View transactions<ArrowUpRight size={15}/></button>{onCoach && <button className="text-button" onClick={() => onCoach(`Help me understand my ${id === 'regular' ? 'regular' : id === 'irregular' ? 'irregular' : 'flexible'} spending basket.`)}>Ask my coach<ArrowRight size={15}/></button>}</div> : null}</div>)}
        <p className={styles.smallPrint}>Transfers and investments excluded. You can edit classifications.</p>
      </section>
      <section className={styles.nextStep} aria-labelledby="next-step-title">
        {unavailable ? <><span className={styles.nextIcon}><ShieldCheck size={26}/></span><h2 id="next-step-title">Start with what you know.</h2><p>You can still learn while estimates are unavailable. Explore how bills and a reserve affect an example balance.</p><button className="button secondary" onClick={onLesson}>Explore the balance lesson<BookOpen size={16}/></button></> : dismissed === recommendationKey ? <><span className={styles.nextIcon}><Check size={26}/></span><h2 id="next-step-title">Your pace. Your choice.</h2><p>That suggestion is hidden for now. Your plan and the learning library are here whenever you need them.</p><button className="text-button" onClick={onLesson}>Browse learning<ArrowRight size={16}/></button><button className="text-button" onClick={() => setDismissed('')}>Show suggestion again</button></> : <><button className={styles.dismiss} onClick={() => setDismissed(recommendationKey)} aria-label="Dismiss this suggestion"><X size={17}/></button><span className={styles.nextIcon}>{lessonComplete ? <ShieldCheck size={26}/> : <BookOpen size={26}/>}</span><h2 id="next-step-title">{signal.kind === 'attention' ? 'Understand the dip before you decide.' : recommendation.title}</h2><p>{signal.kind === 'attention' ? 'Inspect the forecast and test the timing. Pausing extra saving can be a useful step too.' : recommendation.text}</p><button className="button" onClick={signal.kind === 'attention' ? openScenario : lessonComplete ? openScenario : onLesson}>{signal.kind === 'attention' ? 'Explore the forecast' : recommendation.action}<ArrowRight size={16}/></button><details className={styles.why}><summary><Info size={14}/>Why this suggestion?</summary><p>{signal.kind === 'attention' ? 'Your current forecast falls below the reserve you chose. This suggestion is based on those assumptions, not a judgement about your finances.' : recommendation.why}</p><p>Based on this demo account, your selected direction and saved learning progress.</p></details></>}
        <div className={styles.planLink}><span>Your direction</span><button onClick={onPlan}>{goals[goal].title}<ArrowUpRight size={16}/></button></div>
      </section>
    </div>
    <footer className={styles.footer}><ShieldCheck size={16}/><span>Synthetic data · estimated forecasts · no money moves.</span><button className="text-button" onClick={onSettings}>Review data & assumptions</button></footer>
    {scenarioOpen && !unavailable && assumptions && onApplyScenario ? <ScenarioDialog key={`${f.accountId}:${f.asOf}`} assumptions={assumptions} baseline={f} onClose={() => setScenarioOpen(false)} onApply={onApplyScenario}/> : null}
  </div>;
}
