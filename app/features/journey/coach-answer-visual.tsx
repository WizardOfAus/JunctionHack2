'use client';

import { euro, type Basket, type Forecast } from '@/lib/finance';
import { CashflowTimeline } from '@/features/money-insights/cashflow-timeline';
import styles from './coach-answer-visual.module.css';

const baskets: {id: Basket; title: string; example: string}[] = [
  {id:'regular',title:'Everyday essentials',example:'Mandatory and regular · rent and recurring bills'},
  {id:'irregular',title:'Irregular essentials',example:'Mandatory but irregular · repairs and larger needs'},
  {id:'flexible',title:'Flexible everyday',example:'Everyday choices · spending you can review'},
];

/** Render only known answer types from the exact current server forecast. No generated code or model arithmetic. */
export function CoachAnswerVisual({ kind, forecast: f, onEvidence, explanation }: {kind?: string; forecast: Forecast; explanation: string; onEvidence: (basket: Basket) => void}) {
  if (kind === 'basket') {
    const total = Object.values(f.baskets).reduce((sum, value) => sum + value, 0);
    return <section className={styles.card} aria-label="Your three spending baskets"><h3>Your three spending baskets</h3><p>{f.recentPeriod} · monthly average</p>
      <ul className={styles.baskets}>{baskets.map(({id,title,example}) => <li key={id}><button onClick={() => onEvidence(id)}><span><strong>{title}</strong><small>{example}</small></span><b>{euro(f.baskets[id],2)}</b><span className={styles.track} aria-hidden="true"><i className={styles[id]} style={{width:`${total ? f.baskets[id] / total * 100 : 0}%`}}/></span></button></li>)}</ul>
      <p>Select a basket to inspect or correct its transactions.</p><details className={styles.explanation}><summary>Read the explanation</summary><p>{explanation}</p></details></section>;
  }
  if (kind === 'forecast' && !f.blocked) return <section className={styles.card} aria-label="Your cash-flow picture"><h3>Your cash-flow picture</h3><dl><div><dt>Recorded balance</dt><dd>{euro(f.balanceCents,2)}</dd></div><div><dt>Protected reserve</dt><dd>{euro(f.protectedCents,2)}</dd></div><div><dt>Estimated extra room</dt><dd>{euro(f.remainingCents,2)}</dd></div></dl><CashflowTimeline forecast={f} compact/><p>Forecast, not a guarantee. Your current plan assumptions apply.</p>{f.warnings.map(warning => <p className={styles.warning} key={warning}>{warning}</p>)}<details className={styles.explanation}><summary>Read the explanation</summary><p>{explanation}</p></details></section>;
  return null;
}
