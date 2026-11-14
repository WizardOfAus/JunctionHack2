'use client';

import { useId, useState } from 'react';
import { euro, type Forecast } from '@/lib/finance';
import { dateLabel } from './model';
import styles from './money-insights.module.css';

type Props = { forecast: Forecast; compact?: boolean };

export function CashflowTimeline({ forecast: f, compact = false }: Props) {
  const [windowDays, setWindowDays] = useState<14 | 35>(35);
  const [selected, setSelected] = useState<number | null>(null);
  const titleId = useId();
  const points = [{ date: f.dataThrough, balanceCents: f.balanceCents, incomeCents: 0, costCents: 0, label: 'Recorded closing balance' }, ...f.points.slice(0, compact ? f.horizonDays : windowDays)];
  const lowIndex = points.reduce((best, p, index) => p.balanceCents < points[best].balanceCents ? index : best, 0);
  const index = Math.min(selected ?? lowIndex, points.length - 1);
  const point = points[index];
  const minimum = Math.min(0, f.protectedCents, ...points.map(p => p.balanceCents));
  const maximum = Math.max(f.protectedCents, ...points.map(p => p.balanceCents), minimum + 10000);
  const range = maximum - minimum;
  const x = (i: number) => 68 + i / Math.max(1, points.length - 1) * 594;
  const y = (n: number) => 28 + (maximum - n) / range * 168;
  const line = points.map((p, i) => `${x(i)},${y(p.balanceCents)}`).join(' ');
  const ticks = [maximum, Math.round((maximum + minimum) / 2), minimum];
  return <div className={styles.timeline}>
    {!compact && <div className={styles.chartHeading}><div><h2>Your cash-flow outlook</h2><p>One recorded balance. Everything after it is a forecast.</p></div><div className={styles.segmented} aria-label="Forecast window">{([14, 35] as const).map(days => <button key={days} aria-pressed={windowDays === days} onClick={() => { setWindowDays(days); setSelected(null); }}>{days === 14 ? '2 weeks' : `${f.horizonDays} days`}</button>)}</div></div>}
    <div className={styles.chartFrame}>
      <svg viewBox="0 0 700 242" role="img" aria-labelledby={titleId}>
        <title id={titleId}>{`Projected balance from ${dateLabel(f.asOf)}. Protected reserve ${euro(f.protectedCents)}. ${compact ? 'Scenario preview.' : 'Select a date below for the exact figures.'}`}</title>
        {ticks.map((value, i) => <g key={i}><line x1="68" x2="662" y1={y(value)} y2={y(value)} className={styles.gridLine}/><text x="52" y={y(value) + 4} textAnchor="end" className={styles.axisText}>{euro(value)}</text></g>)}
        <polygon points={`68,196 ${line} ${x(points.length - 1)},196`} className={styles.chartArea}/>
        <line x1="68" x2="662" y1={y(f.protectedCents)} y2={y(f.protectedCents)} className={styles.reserveLine}/>
        <polyline points={line} className={styles.forecastLine}/>
        {points.map((p, i) => p.incomeCents > 0 ? <g key={p.date}><line x1={x(i)} x2={x(i)} y1={y(p.balanceCents)} y2="196" className={styles.incomeGuide}/><circle cx={x(i)} cy={y(p.balanceCents)} r="4" className={styles.incomeDot}/></g> : null)}
        <line x1={x(index)} x2={x(index)} y1="20" y2="196" className={styles.cursorLine}/>
        <circle cx={x(index)} cy={y(point.balanceCents)} r="6" className={styles.selectedDot}/>
        <circle cx="68" cy={y(f.balanceCents)} r="4" className={styles.recordedDot}/>
        <text x="68" y="226" className={styles.axisText}>{dateLabel(points[0].date)}</text>
        <text x={x(Math.floor((points.length - 1) / 2))} y="226" textAnchor="middle" className={styles.axisText}>{dateLabel(points[Math.floor((points.length - 1) / 2)].date)}</text>
        <text x="662" y="226" textAnchor="end" className={styles.axisText}>{dateLabel(points.at(-1)!.date)}</text>
      </svg>
    </div>
    <div className={styles.legend}><span><i className={styles.lineKey}/>Projected balance</span><span><i className={styles.reserveKey}/>Protected {euro(f.protectedCents)}</span><span><i className={styles.paydayKey}/>Expected income</span></div>
    {!compact && <>
      <label className={styles.dateSlider}><span>Explore a date <strong>{dateLabel(point.date, true)}</strong></span><input type="range" min="0" max={points.length - 1} value={index} onChange={event => setSelected(Number(event.target.value))} aria-valuetext={`${dateLabel(point.date)}: ${euro(point.balanceCents, 2)}, ${point.label}`}/></label>
      <div className={styles.dayReadout} aria-live="polite"><div><span>{index === 0 ? 'Recorded balance' : 'Projected balance'}</span><strong>{euro(point.balanceCents, 2)}</strong></div><div><span>{point.label}</span><p>{index === 0 ? 'The starting point from your connected demo history.' : `${point.incomeCents > 0 ? `${euro(point.incomeCents)} expected in · ` : ''}${euro(point.costCents, 2)} expected out`}</p></div></div>
      <details className={styles.details}><summary>View daily figures</summary><div className={styles.tableScroll}><table><caption>Forecast figures; outgoings include existing saving transfers.</caption><thead><tr><th scope="col">Date</th><th scope="col">Balance</th><th scope="col">In</th><th scope="col">Out</th></tr></thead><tbody>{points.map((p, i) => <tr key={`${p.date}-${i}`}><th scope="row">{dateLabel(p.date)}{i === 0 ? ' · recorded' : ''}</th><td>{euro(p.balanceCents, 2)}</td><td>{i === 0 ? '—' : euro(p.incomeCents, 2)}</td><td>{i === 0 ? '—' : euro(p.costCents, 2)}</td></tr>)}</tbody></table></div></details>
    </>}
  </div>;
}
