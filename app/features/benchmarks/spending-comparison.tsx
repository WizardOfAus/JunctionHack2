'use client';

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Benchmarks } from '@/lib/benchmarks';
import { euro } from '@/lib/finance';
import { dateLabel } from '../money-insights/model';
import styles from './spending-comparison.module.css';

/** All amounts and group placement come from the server. Bars only scale their display. */
export function SpendingComparison({ data }: { data: Benchmarks }) {
  const selectId = useId();
  const [category, setCategory] = useState(data.categories[0]?.category ?? '');
  const selected = data.categories.find(row => row.category === category) ?? data.categories[0];
  if (!selected || !data.period.months) return null;

  const rows = [
    { label: 'This account', detail: 'Your average month', cents: selected.youCents, own: true },
    { label: 'Synthetic dataset', detail: 'Median across the dataset', cents: selected.dataset.p50 },
    { label: data.groups.incomeQuintile.label, detail: 'Median in this salary group', cents: selected.incomeQuintileMedianCents },
    { label: data.groups.ageBand?.label ?? 'Age group unavailable', detail: 'Median in this recorded age group', cents: selected.ageBandMedianCents },
    { label: 'Finland · 2022 prices', detail: 'Survey average per consumption unit', cents: selected.national?.cents ?? null },
  ];
  const maximum = Math.max(1, ...rows.map(row => row.cents ?? 0));

  return <details className={styles.panel}>
    <summary className={styles.summary}>
      <span><strong>Your spending in perspective</strong><span>A comparison, not advice</span></span>
      <ChevronDown size={20} aria-hidden="true"/>
    </summary>
    <div className={styles.content}>
      <p className={styles.intro}>Explore one category at a time. Higher or lower spending isn’t a score.</p>
      <label className={styles.field} htmlFor={selectId}>Spending category
        <select id={selectId} value={selected.category} onChange={event => setCategory(event.target.value)}>
          {data.categories.map(row => <option key={row.category}>{row.category}</option>)}
        </select>
      </label>
      <div aria-live="polite" aria-atomic="true">
        <h3 className={styles.heading}>{selected.category} per month</h3>
        <p className={styles.position}>{selected.dataset.words} in the synthetic dataset <span>({selected.dataset.band})</span>.</p>
        <dl className={styles.comparisons}>
          {rows.map(row => <div key={row.label} className={row.own ? styles.own : ''}>
            <dt><span>{row.label}</span><small>{row.detail}</small></dt>
            <dd><strong>{row.cents === null ? 'Not comparable' : euro(row.cents, 2)}</strong>
              {row.cents !== null ? <span className={styles.track} aria-hidden="true"><span style={{ width: `${row.cents / maximum * 100}%` }}/></span> : null}
            </dd>
          </div>)}
        </dl>
        {selected.national?.note ? <p className={styles.note}>{selected.national.note}</p> : null}
        {!selected.national ? <p className={styles.note}>No comparable national survey category is available for this category.</p> : null}
      </div>
      <details className={styles.sources}>
        <summary>Periods, groups and sources</summary>
        <p>Your average covers {data.period.months} calendar months{data.period.from && data.period.to ? `, ${dateLabel(data.period.from, true)}–${dateLabel(data.period.to, true)}` : ''}. Saving transfers are excluded. Scenario changes do not rewrite recorded spending.</p>
        <p>{data.groups.dataset}. The middle 80% in this category spans {euro(selected.dataset.p10)}–{euro(selected.dataset.p90)} per month.</p>
        <p>Salary groups and recorded age groups are separate comparisons; they do not describe identical households.</p>
        <p>{data.groups.national.label}. {data.groups.national.priceBasis}.</p>
        <ul>{data.notes.map(note => <li key={note}>{note}</li>)}</ul>
        <a href={data.groups.national.sourceUrl} target="_blank" rel="noreferrer">{data.groups.national.source} · {data.groups.national.licence} (opens in a new tab)</a>
      </details>
    </div>
  </details>;
}
