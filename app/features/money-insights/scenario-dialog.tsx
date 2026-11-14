'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarClock, ShieldCheck, Utensils, X } from 'lucide-react';
import { DEFAULT_PERSONA_ID, type PersonaId } from '@/lib/contracts';
import { euro, type Assumptions, type Forecast } from '@/lib/finance';
import { CashflowTimeline } from './cashflow-timeline';
import styles from './money-insights.module.css';

type ScenarioKind = 'expense' | 'payday' | 'spending';
type Props = { personaId?: PersonaId; initialKind?: ScenarioKind; initialReduction?: number; assumptions: Assumptions; baseline: Forecast; onClose: () => void; onApply: (patch: Partial<Assumptions>) => void };
const scenarios = [
  { id: 'expense', label: 'Unexpected cost', icon: ShieldCheck },
  { id: 'payday', label: 'Later payday', icon: CalendarClock },
  { id: 'spending', label: 'Eating out', icon: Utensils },
] as const;

export function ScenarioDialog({ personaId = DEFAULT_PERSONA_ID, initialKind = 'expense', initialReduction, assumptions, baseline, onClose, onApply }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<ScenarioKind>(initialKind);
  const [expense, setExpense] = useState(String((assumptions.unexpectedCents || 25000) / 100));
  const [delay, setDelay] = useState(assumptions.incomeDelayDays || 7);
  const [reduction, setReduction] = useState(initialReduction ?? (assumptions.restaurantReduction || 20));
  const [result, setResult] = useState<{ key: string; forecast: Forecast } | null>(null);
  const [failure, setFailure] = useState('');
  const [retry, setRetry] = useState(0);
  const expenseNumber = Number(expense);
  const valid = kind !== 'expense' || (expense.trim() !== '' && Number.isFinite(expenseNumber) && expenseNumber >= 0 && expenseNumber <= 10000);
  const patch: Partial<Assumptions> = kind === 'expense' ? { unexpectedCents: Math.round(expenseNumber * 100) } : kind === 'payday' ? { incomeDelayDays: delay } : { restaurantReduction: reduction };
  const requestKey = valid ? JSON.stringify({ ...assumptions, ...patch, personaId }) : '';
  const preview = result?.key === requestKey ? result.forecast : null;
  const loading = valid && !preview && !failure;

  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  useEffect(() => {
    setFailure('');
    if (!requestKey) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: requestKey, signal: controller.signal });
        const data = await response.json() as { forecast?: Forecast; error?: string };
        if (!response.ok || !data.forecast) throw new Error(data.error || 'The preview could not be calculated.');
        if (!controller.signal.aborted) setResult({ key: requestKey, forecast: data.forecast });
      } catch (error) {
        if (!controller.signal.aborted) setFailure(error instanceof Error ? error.message : 'The preview could not be calculated.');
      }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [requestKey, retry]);

  return <dialog ref={dialog} className={styles.scenarioDialog} aria-labelledby="scenario-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={styles.dialogHeader}><div><h2 id="scenario-title">What if life changes?</h2></div><button className="icon-button" onClick={onClose} aria-label="Close scenario"><X size={21}/></button></div>
    <div className={styles.dialogBody}>
      <p className={styles.dialogIntro}>Try one change against your current plan. These are editable scenarios, not predictions about you.</p>
      <div className={styles.scenarioChoices} aria-label="Scenario type">{scenarios.map(({ id, label, icon: Icon }) => <button key={id} aria-pressed={kind === id} onClick={() => setKind(id)}><Icon size={19}/>{label}</button>)}</div>
      <div className={styles.scenarioInput}>
        {kind === 'expense' ? <><label htmlFor="scenario-expense">An unexpected essential cost</label><div className={styles.amountInput}><span>€</span><input id="scenario-expense" type="number" inputMode="decimal" min="0" max="10000" step="10" value={expense} onChange={event => setExpense(event.target.value)} aria-describedby="scenario-input-hint" aria-invalid={!valid}/></div><p id="scenario-input-hint">Replaces the unexpected-cost assumption in your current plan. Enter €0–€10,000.</p></> : null}
        {kind === 'payday' ? <><label htmlFor="scenario-payday">What if your salary arrives later?</label><select id="scenario-payday" value={delay} onChange={event => setDelay(Number(event.target.value))}><option value={0}>On the expected date</option><option value={7}>1 week later</option><option value={14}>2 weeks later</option><option value={30}>1 month later</option></select><p>Moves the expected salary date in this scenario. It doesn’t change historical income.</p></> : null}
        {kind === 'spending' ? <><label htmlFor="scenario-restaurants">Reduce flexible restaurant spending <strong>{reduction}%</strong></label><input id="scenario-restaurants" type="range" min="0" max="100" step="5" value={reduction} onChange={event => setReduction(Number(event.target.value))}/><p>Uses the flexible portion of your historical restaurant average. Any purchases classified as essential stay protected.</p></> : null}
      </div>
      <div className={styles.scenarioResult} aria-busy={loading} aria-live="polite">
        {!valid ? <p role="alert">Enter an amount between €0 and €10,000 to see the preview.</p> : failure ? <div role="alert"><p>{failure}</p><button className="text-button" onClick={() => { setResult(null); setRetry(value => value + 1); }}>Try again</button></div> : loading ? <p role="status">Calculating your scenario…</p> : preview ? <>
          <div className={styles.comparison}><div><span>Current lowest balance</span><strong>{euro(baseline.minimumCents, 2)}</strong></div><ArrowRight size={20}/><div><span>With this change</span><strong>{euro(preview.minimumCents, 2)}</strong></div></div>
          <p className={preview.minimumCents < preview.protectedCents || preview.blocked ? styles.resultWarning : styles.resultNote}>{preview.blocked ? preview.warnings[0] || 'Review your data before using this estimate.' : preview.minimumCents < preview.protectedCents ? `This scenario dips below your ${euro(preview.protectedCents)} protected reserve. Review the timing and assumptions before adding extra saving.` : `The projected balance stays above your ${euro(preview.protectedCents)} protected reserve.`}</p>
          {preview.warnings.map(warning => <p key={warning} className={styles.resultWarning}>{warning}</p>)}
          {!preview.blocked && <CashflowTimeline forecast={preview} compact/>}
          <div className={styles.roomComparison}><span>Estimated extra room</span><span>{euro(baseline.remainingCents, 2)} <ArrowRight size={14}/> <strong>{preview.blocked ? 'Paused' : euro(preview.remainingCents, 2)}</strong></span></div>
          <p className={styles.smallPrint}>Forecast over {preview.horizonDays} days. Other assumptions stay as they are. Nothing has been saved or transferred.</p>
        </> : null}
      </div>
    </div>
    <div className={styles.dialogFooter}><button className="text-button" onClick={onClose}>Keep my current plan</button><button className="button" disabled={!valid || !preview || preview.blocked || !!failure} onClick={() => { if (preview && !preview.blocked) { onApply(patch); onClose(); } }}>Use in my plan<ArrowRight size={17}/></button></div>
  </dialog>;
}
