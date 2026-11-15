'use client';

import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { ActionButton } from '@/components/mobile/action-button';
import { ResponsiveSheet } from '@/components/mobile/responsive-sheet';
import sheetStyles from './scenario.module.css';
import { DEFAULT_PERSONA_ID, type PersonaId } from '@/lib/contracts';
import { euro, type Assumptions, type Forecast } from '@/lib/finance';
import { CashflowTimeline } from './cashflow-timeline';

type ScenarioKind = 'expense' | 'payday' | 'spending';
type Props = { open?: boolean; personaId?: PersonaId; initialKind?: ScenarioKind; initialReduction?: number; assumptions: Assumptions; baseline: Forecast; onClose: () => void; onApply: (patch: Partial<Assumptions>) => void };
const scenarios = [
  { id: 'expense', label: 'Unexpected cost' },
  { id: 'payday', label: 'Later payday' },
  { id: 'spending', label: 'Eating out' },
] as const;

export function ScenarioDialog({ open = true, personaId = DEFAULT_PERSONA_ID, initialKind = 'expense', initialReduction, assumptions, baseline, onClose, onApply }: Props) {
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

  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setExpense(String((assumptions.unexpectedCents || 25000) / 100));
    setDelay(assumptions.incomeDelayDays || 7);
    setReduction(initialReduction ?? (assumptions.restaurantReduction || 20));
    setResult(null);
  }, [open, initialKind, initialReduction, assumptions]);
  useEffect(() => {
    setFailure('');
    if (!open || !requestKey) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: requestKey, signal: controller.signal });
        const data = await response.json() as { forecast?: Forecast; error?: string };
        if (!response.ok || !data.forecast) throw new Error(data.error || 'The preview could not be calculated.');
        if (!controller.signal.aborted) setResult({ key: requestKey, forecast: data.forecast });
      } catch (error) {
        if (!controller.signal.aborted) setFailure(error instanceof TypeError ? 'We couldn’t update this preview. Check your connection and try again.' : error instanceof Error ? error.message : 'The preview could not be calculated. Try again.');
      }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, requestKey, retry]);

  return <ResponsiveSheet open={open} onOpenChange={next => { if (!next) onClose(); }} title="Explore a what-if" description="Your plan stays unchanged until you apply this preview." footer={<>
    <ActionButton busy={loading} busyLabel="Calculating preview…" disabled={!valid || !preview || preview.blocked || !!failure} onClick={() => { if (preview && !preview.blocked && !failure) { onApply(patch); onClose(); } }}>Use in my plan<ArrowRight size={17}/></ActionButton>
    <ActionButton variant="quiet" onClick={onClose}>Keep my current plan</ActionButton>
  </>}>
    <div className={sheetStyles.scenario}>
      <label className={sheetStyles.choice} htmlFor="scenario-kind">Change to explore<select id="scenario-kind" value={kind} onChange={event => setKind(event.target.value as ScenarioKind)}>{scenarios.map(({id,label}) => <option key={id} value={id}>{label}</option>)}</select></label>
      <div className={sheetStyles.scenarioInput}>
        {kind === 'expense' ? <><label htmlFor="scenario-expense">Amount</label><div className={sheetStyles.amountInput}><span>€</span><input id="scenario-expense" type="number" inputMode="decimal" min="0" max="10000" step="10" value={expense} onChange={event => setExpense(event.target.value)} aria-describedby="scenario-input-hint" aria-invalid={!valid}/></div><p id="scenario-input-hint">Enter €0–€10,000. Replaces this cost in your plan.</p></> : null}
        {kind === 'payday' ? <><label htmlFor="scenario-payday">What if your salary arrives later?</label><select id="scenario-payday" value={delay} onChange={event => setDelay(Number(event.target.value))}><option value={0}>On the expected date</option><option value={7}>1 week later</option><option value={14}>2 weeks later</option><option value={30}>1 month later</option></select><p>Only the forecast changes; historical income stays the same.</p></> : null}
        {kind === 'spending' ? <><label htmlFor="scenario-restaurants">Reduce flexible restaurant spending <strong>{reduction}%</strong></label><input id="scenario-restaurants" type="range" min="0" max="100" step="5" value={reduction} onChange={event => setReduction(Number(event.target.value))}/><p>Based on your flexible restaurant spending. Essential purchases stay protected.</p></> : null}
      </div>
      <div className={sheetStyles.scenarioResult} aria-busy={loading} aria-live="polite">
        {!valid ? <p role="alert">Enter an amount between €0 and €10,000 to see the preview.</p> : failure ? <div role="alert"><p>{failure}</p><button className="text-button" onClick={() => { setResult(null); setRetry(value => value + 1); }}>Try again</button></div> : loading ? <p role="status">Calculating your scenario…</p> : preview ? <>
          <div className={sheetStyles.comparison}><div><span>Current plan · lowest balance</span><strong>{euro(baseline.minimumCents, 2)}</strong></div><ArrowRight size={20}/><div><span>Preview · lowest balance</span><strong>{euro(preview.minimumCents, 2)}</strong></div></div>
          <p className={preview.minimumCents < preview.protectedCents || preview.blocked ? sheetStyles.resultWarning : sheetStyles.resultNote}>{preview.blocked ? preview.warnings[0] || 'Review your data before using this estimate.' : preview.minimumCents < preview.protectedCents ? `This scenario dips below your ${euro(preview.protectedCents)} protected reserve. Review the timing and assumptions before adding extra saving.` : `The projected balance stays above your ${euro(preview.protectedCents)} protected reserve.`}</p>
          {preview.warnings.filter((_, index) => !preview.blocked || index > 0).map(warning => <p key={warning} className={sheetStyles.resultWarning}>{warning}</p>)}
          {!preview.blocked && <details className={sheetStyles.forecastDetail}><summary>Explore the projected timeline</summary><CashflowTimeline forecast={preview} compact/></details>}
          <div className={sheetStyles.roomComparison}><span>Estimated extra room</span><span>{euro(baseline.remainingCents, 2)} <ArrowRight size={14}/> <strong>{preview.blocked ? 'Paused' : euro(preview.remainingCents, 2)}</strong></span></div>
          <p className={sheetStyles.smallPrint}>{preview.horizonDays}-day forecast · nothing saved or transferred.</p>
        </> : null}
      </div>
    </div>
  </ResponsiveSheet>;
}
