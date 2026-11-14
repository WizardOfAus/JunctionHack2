'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ShieldCheck, Wallet, Zap } from 'lucide-react';
import { euro, type Forecast } from '@/lib/finance';
import { checkPrediction, lessonRoom, practice } from './balance-model';
import styles from './balance-lesson.module.css';

type Props = { completed: boolean; forecast: Forecast; unavailable: boolean; onComplete: () => void; onMoney: () => void; onNext: () => void };
export function BalanceLesson({ completed, forecast, unavailable, onComplete, onMoney, onNext }: Props) {
  const [stage, setStage] = useState(0);
  const [reserve, setReserve] = useState(30000);
  const [answer, setAnswer] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const correct = checkPrediction(answer);
  const room = lessonRoom(100000, 60000, reserve);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }, [stage]);

  return <section className={styles.studio} aria-labelledby="balance-heading">
    <aside className={styles.path}><h2>Money foundations</h2><p>Learn by trying.</p><ol><li className={styles.current}><span>{completed ? <Check size={19}/> : <Wallet size={19}/>}</span><div><strong>Your balance has a job</strong><small>{completed ? 'Completed · revisit any time' : 'Interactive · 2 min · 40 XP'}</small></div></li><li><span><ShieldCheck size={18}/></span><div><button onClick={onNext}>Build your safety net<ArrowRight size={14}/></button><small>Up next · 3 min · 50 XP</small></div></li></ol><p className={styles.noPressure}>Progress saved. Come back whenever you like.</p><button className="text-button" onClick={onMoney}><ArrowLeft size={16}/>Back to my money</button></aside>
    <div className={styles.lesson}>
      <div className={styles.progress}><ol aria-label="Lesson progress">{['Explore', 'Predict', 'Connect'].map((name, i) => <li key={name} aria-current={stage === i ? 'step' : undefined} className={stage >= i ? styles.reached : ''}><span>{i < stage ? <Check size={13}/> : i + 1}</span>{name}</li>)}</ol><span><Zap size={15}/>{completed ? '40 XP saved' : '40 XP'}</span></div>
      <h1 id="balance-heading" ref={heading} tabIndex={-1}>{stage === 0 ? 'Give every euro a job.' : stage === 1 ? 'What’s left to choose with?' : 'See it in your own numbers.'}</h1>
      <p className={styles.intro}>{stage === 0 ? 'Set aside €600 for rent. Adjust your reserve to see what’s left.' : stage === 1 ? 'Cover the bills and reserve below. What remains?' : 'Your forecast applies the same idea to income, spending and reserves.'}</p>
      {stage === 0 ? <>
        <div className={styles.canvas}>
          <div className={styles.canvasHeader}><span>Illustrative account</span><strong>€1,000.00</strong></div>
          <div className={styles.cells} role="img" aria-label={`100 squares, each worth €10. Rent €600. Reserve ${euro(reserve)}. Extra room ${euro(room)}.`}>{Array.from({ length: 100 }, (_, i) => <span aria-hidden="true" key={i} className={i < 60 ? styles.bills : i < 60 + reserve / 1000 ? styles.reserve : styles.free}/>)}</div>
          <div className={styles.legend}><span><i className={styles.bills}/>Rent<strong>€600</strong></span><span><i className={styles.reserve}/>Reserve<strong>{euro(reserve)}</strong></span><span><i className={styles.free}/>Room<strong>{euro(room)}</strong></span></div>
          <p className={styles.unit}>Each square = €10. The whole grid is still yours.</p>
          <label className={styles.sliderLabel} htmlFor="explore-reserve">Your reserve<strong>{euro(reserve)}</strong></label><input id="explore-reserve" type="range" min="10000" max="40000" step="5000" value={reserve} aria-valuetext={`${euro(reserve)} reserve; ${euro(room)} extra room`} onChange={event => setReserve(Number(event.target.value))}/><div className={styles.rangeLabels}><span>€100 reserve</span><span>€400 reserve</span></div>
        </div>
        <div className={styles.observation} aria-live="polite"><ShieldCheck size={21}/><p>{reserve === 40000 ? '€0 extra room. Everything is assigned—and that can be a sensible plan.' : `${euro(room)} left after rent and reserve. Your €1,000 balance stays the same.`}</p></div>
        <div className={styles.actions}><span>Practice only. Your demo plan is unchanged.</span><button className="button" onClick={() => { setChecked(false); setAnswer(null); setStage(1); }}>Try it yourself<ArrowRight size={17}/></button></div>
      </> : stage === 1 ? <>
        <div className={styles.problem}><div><span>Balance</span><strong>€1,200</strong></div><div><span>Upcoming bills</span><strong>− €650</strong></div><div><span>Protected reserve</span><strong>− €350</strong></div><div className={styles.mystery}><span>Extra room</span><strong>{checked && correct ? '€200' : '?'}</strong></div></div>
        <fieldset className={styles.answers}><legend>Your prediction</legend>{[120000, 55000, 20000].map(value => <label key={value} className={`${answer === value ? styles.selected : ''} ${checked && correct && answer === value ? styles.correct : ''}`}><input type="radio" name="balance-prediction" checked={answer === value} onChange={() => { setAnswer(value); setChecked(false); }}/><span>{euro(value)}</span>{checked && correct && answer === value ? <CheckCircle2 size={19}/> : null}</label>)}</fieldset>
        {checked ? <div className={`${styles.feedback} ${correct ? styles.success : ''}`} role="status"><strong>{correct ? 'Exactly. You’ve given every euro a job.' : answer === 120000 ? 'The balance still includes money with a job.' : 'You’ve covered the bills. What about the reserve?'}</strong><p>{correct ? `${euro(practice.balanceCents)} − ${euro(practice.billsCents)} − ${euro(practice.reserveCents)} = €200. The reserve stays in your account, but it isn’t extra spending room.` : answer === 120000 ? 'First cover the upcoming bills, then protect the reserve. Try the amount that remains after both.' : '€550 is what remains after bills alone. Protect €350 of that, then try again.'}</p>{correct ? <span className={styles.reward}><Zap size={17}/>{completed ? '40 XP saved · no cash value' : '+40 XP · no cash value'}</span> : null}</div> : null}
        <div className={styles.actions}><button className="text-button" onClick={() => setStage(0)}><ArrowLeft size={16}/>Explore again</button>{checked && correct ? <button className="button" onClick={() => setStage(2)}>Connect it to my money<ArrowRight size={17}/></button> : <button className="button" disabled={answer === null} onClick={() => { setChecked(true); if (correct) onComplete(); }}>Check my prediction<Check size={17}/></button>}</div>
      </> : <>
        <div className={styles.connection}><Wallet size={28}/><h2>Your money, with context.</h2><p>Your {forecast.horizonDays}-day forecast includes expected income and outgoings.</p><dl><div><dt>Recorded demo balance</dt><dd>{unavailable ? '—' : euro(forecast.balanceCents, 2)}</dd></div><div><dt>Estimated extra room</dt><dd>{unavailable ? 'Check overview' : forecast.blocked ? 'Paused' : euro(forecast.remainingCents, 2)}</dd></div></dl><p>{forecast.blocked || unavailable ? 'Estimates need current data and confirmed coverage. You can still keep learning while those are checked.' : 'Explore your forecast to see what’s projected and what’s protected.'}</p></div>
        <div className={styles.takeaway}><CheckCircle2 size={23}/><p><strong>Keep this idea:</strong><br/>Before asking “Can I spend it?”, ask “Does this money already have a job?”</p></div>
        <div className={styles.actions}><button className="text-button" onClick={() => setStage(0)}>Revisit the diagram</button><button className="button" onClick={onMoney}>See my money overview<ArrowRight size={17}/></button></div>
      </>}
    </div>
  </section>;
}
