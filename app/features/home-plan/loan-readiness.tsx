import { euro } from '@/lib/finance';
import type { LoanReadiness } from '@/lib/loan-readiness';
import styles from './loan-readiness.module.css';

export function LoanReadinessPanel({ value, pending, unavailable }: { value: LoanReadiness | null; pending: boolean; unavailable: boolean }) {
  return <section className={styles.panel} aria-labelledby="readiness-title" aria-busy={pending}>
    <h2 id="readiness-title">Explore a home purchase</h2>
    <p className={styles.label}>Education, not a credit decision</p>
    {pending ? <p role="status">Updating the purchase illustration…</p> : unavailable || !value ? <p>Confirm your data and assumptions to explore these estimates.</p> : <>
      <p><strong>{value.basis.source}</strong> · {euro(value.basis.priceCents)} price · {euro(value.basis.equityCents)} own funds.</p>
      <p className={styles.note}>{value.basis.source.startsWith('Application record') ? 'The purchase figures come from the historical application record. Your editable home goal is separate; this does not reassess the recorded decision.' : 'The purchase figures follow the home price and savings you entered in Your preferences.'}</p>
      <dl className={styles.checks}>{value.checks.map(check => <div key={check.id}>
        <dt><strong>{check.label}</strong><span>{check.status === 'met' ? 'Illustration meets target' : check.status === 'short' ? 'Gap to explore' : 'Not enough information'}</span></dt>
        <dd>{'valueCents' in check && check.valueCents !== undefined ? <><strong>{euro(check.valueCents,2)}</strong> / {euro(check.targetCents!,2)} target{check.gapCents! > 0 ? <span>Gap: {euro(check.gapCents!,2)}</span> : null}</> : <><strong>{check.valueMonths ?? 'Unknown'}</strong> / {check.targetMonths} months<span>{check.gapMonths!=null&&check.gapMonths>0?`Gap: ${check.gapMonths} months. `:null}Before any deposit is paid from this account.</span></>}
          <details><summary>How this is calculated</summary><p>{check.explanation}</p>{check.source.startsWith('https://') ? <a href={check.source} target="_blank" rel="noreferrer">Source: FIN-FSA</a> : <p>Source: {check.source}</p>}</details>
        </dd>
      </div>)}</dl>
      <h3>Two monthly payment illustrations</h3>
      <div className={styles.payments}>
        <div><span>Public market reference</span><strong>{value.payments.market ? euro(value.payments.market.monthlyCents,2) : 'Not available'}</strong>{value.payments.market ? <><p>{value.payments.market.annualPercent}% · {value.payments.market.years} years · {value.payments.market.month}</p><a href={value.payments.market.source} target="_blank" rel="noreferrer">Bank of Finland rate source</a><p>{value.payments.market.label}</p></> : null}</div>
        <div><span>Higher-rate illustration</span><strong>{euro(value.payments.stress.monthlyCents,2)}</strong><p>{value.payments.stress.annualPercent}% · {value.payments.stress.years} years</p><p>An annuity calculation, excluding loan fees and other debts. It is not a quote.</p></div>
      </div>
      <details className={styles.options}><summary>What would it take in this model?</summary><p>These are separate ways to explore the gap, not amounts to add together. Income is the recorded median salary; household finances and collateral are incomplete.</p><dl>
        <div><dt>Loan supported by the income formula</dt><dd>{euro(value.whatItWouldTake.maxLoanAtIncomeCents)}</dd></div>
        <div><dt>Price supported by income and own funds</dt><dd>{euro(value.whatItWouldTake.maxPriceCents)}</dd></div>
        <div><dt>Additional own funds for this price</dt><dd>{euro(value.whatItWouldTake.extraEquityCents)}</dd></div>
        <div><dt>Additional monthly income for this loan</dt><dd>{euro(value.whatItWouldTake.extraMonthlyIncomeCents)}</dd></div>
        <div><dt>Illustrative monthly surplus</dt><dd>{euro(value.whatItWouldTake.monthlySurplusCents)}</dd></div>
        <div><dt>Months to build the extra own funds</dt><dd>{value.whatItWouldTake.monthsToSaveExtraEquity ?? 'No positive surplus'}</dd></div>
      </dl><p>Assumes the observed surplus continues. Excludes interest, purchase costs and future changes. This is not a recommended saving amount.</p></details>
      <ul className={styles.notes}>{value.notes.map(note=><li key={note}>{note}</li>)}</ul>
    </>}
  </section>;
}
