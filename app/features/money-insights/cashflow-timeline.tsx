'use client';

import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { euro, type Forecast } from '@/lib/finance';
import { dateLabel } from './model';
import styles from './money-insights.module.css';

type Props = { forecast: Forecast; compact?: boolean };

export function CashflowTimeline({ forecast: f, compact = false }: Props) {
  const [windowDays, setWindowDays] = useState<14 | 35>(35);
  const [selected, setSelected] = useState<number | null>(null);
  const titleId = useId();
  const helpId = useId();
  const points = [{ date: f.dataThrough, balanceCents: f.balanceCents, incomeCents: 0, costCents: 0, label: 'Recorded closing balance' }, ...f.points.slice(0, compact ? f.horizonDays : windowDays)];
  const lowIndex = points.reduce((best, p, index) => p.balanceCents < points[best].balanceCents ? index : best, 0);
  const index = Math.min(selected ?? lowIndex, points.length - 1);
  const point = points[index];
  const minimum = Math.min(0, f.protectedCents, ...points.map(p => p.balanceCents));
  const maximum = Math.max(f.protectedCents, ...points.map(p => p.balanceCents), minimum + 10000);
  const range = maximum - minimum;
  const x = (i: number) => i / Math.max(1, points.length - 1) * 600;
  const y = (n: number) => (maximum - n) / range * 200;
  const line = points.map((p, i) => `${x(i)},${y(p.balanceCents)}`).join(' ');
  const ticks = [maximum, Math.round((maximum + minimum) / 2), minimum];
  const explore = (event: PointerEvent<HTMLDivElement>) => {
    if (compact) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    setSelected(Math.round(ratio * (points.length - 1)));

  };

  const exploreWithKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1
      : ['ArrowRight', 'ArrowUp'].includes(event.key) ? index + 1
      : ['ArrowLeft', 'ArrowDown'].includes(event.key) ? index - 1
      : event.key === 'PageUp' ? index + 7 : event.key === 'PageDown' ? index - 7 : null;
    if (next === null) return;
    event.preventDefault();
    setSelected(Math.max(0, Math.min(points.length - 1, next)));
  };

  return <div className={styles.timeline}>
    {!compact && <>
      <div className={styles.chartHeading}><h2>Cash-flow outlook</h2><div className={styles.segmented} aria-label="Forecast window">{([14, 35] as const).map(days => <button key={days} aria-pressed={windowDays === days} onClick={() => { setWindowDays(days); setSelected(null); }}>{days === 14 ? '2 weeks' : `${f.horizonDays} days`}</button>)}</div></div>
      <div className={styles.chartReadout}><div><span>{index === 0 ? 'Recorded balance' : 'Projected balance'}</span><strong>{euro(point.balanceCents, 2)}</strong></div><time dateTime={point.date}>{dateLabel(point.date, true)}</time></div>
    </>}
    <div className={styles.chartFrame}>
      <div className={styles.yAxis} aria-hidden="true">{ticks.map((value, i) => <span key={i} style={{ top: `${y(value) / 2}%` }}>{euro(value)}</span>)}</div>
      <div className={`${styles.plot} ${compact ? styles.compactPlot : styles.interactivePlot}`}
        role={compact ? undefined : 'slider'} tabIndex={compact ? undefined : 0}
        aria-label={compact ? undefined : 'Cash-flow date'} aria-describedby={compact ? undefined : helpId}
        aria-valuemin={compact ? undefined : 0} aria-valuemax={compact ? undefined : points.length - 1}
        aria-valuenow={compact ? undefined : index}
        aria-valuetext={compact ? undefined : `${dateLabel(point.date, true)}: ${euro(point.balanceCents, 2)}, ${point.label}`}
        onKeyDown={compact ? undefined : exploreWithKeys}
        onPointerMove={event => { if (event.pointerType === 'mouse' || event.currentTarget.hasPointerCapture(event.pointerId)) explore(event); }}
        onPointerDown={event => { if (!compact) { event.currentTarget.setPointerCapture(event.pointerId); explore(event); } }}
        onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        >
        <svg viewBox="0 0 600 200" preserveAspectRatio="none" role={compact ? "img" : undefined} aria-hidden={!compact || undefined} aria-labelledby={compact ? titleId : undefined}>
          <title id={titleId}>{`Projected balance from ${dateLabel(f.asOf)}. Protected reserve ${euro(f.protectedCents)}. ${compact ? 'Scenario preview.' : 'Explore the chart for exact figures.'}`}</title>
          {ticks.map((value, i) => <line key={i} x1="0" x2="600" y1={y(value)} y2={y(value)} className={styles.gridLine}/>)}
          <polygon points={`0,200 ${line} 600,200`} className={styles.chartArea}/>
          <line x1="0" x2="600" y1={y(f.protectedCents)} y2={y(f.protectedCents)} className={styles.reserveLine}/>
          <polyline points={line} className={styles.forecastLine}/>
          {points.map((p, i) => p.incomeCents > 0 ? <line key={p.date} x1={x(i)} x2={x(i)} y1={y(p.balanceCents)} y2="200" className={styles.incomeGuide}/> : null)}
          <line x1={x(index)} x2={x(index)} y1="0" y2="200" className={styles.cursorLine}/>
        </svg>
        {points.map((p, i) => p.incomeCents > 0 ? <span key={p.date} className={styles.incomeDot} style={{ left: `${x(i) / 6}%`, top: `${y(p.balanceCents) / 2}%` }}/> : null)}
        <span className={styles.recordedDot} style={{ top: `${y(f.balanceCents) / 2}%` }}/>
        <span className={styles.selectedDot} style={{ left: `${x(index) / 6}%`, top: `${y(point.balanceCents) / 2}%` }}/>
      </div>
      <div className={styles.xAxis} aria-hidden="true"><span>{dateLabel(points[0].date)}</span><span>{dateLabel(points[Math.floor((points.length - 1) / 2)].date)}</span><span>{dateLabel(points.at(-1)!.date)}</span></div>
    </div>
    <div className={styles.legend}><span><i className={styles.lineKey}/>Forecast</span><span><i className={styles.reserveKey}/>Reserve {euro(f.protectedCents)}</span><span><i className={styles.paydayKey}/>Payday</span></div>
    {!compact && <>
      <p id={helpId} className={styles.exploreHint}>Explore the chart<span className={styles.pointerHint}> · hover or drag</span><span className={styles.touchHint}> · touch and slide</span><span className="sr-only">. Use arrow keys for a day, Page Up or Page Down for a week, Home or End for the first or last date. Daily figures are also available below.</span></p>
      <div className={styles.dayReadout}><span>{point.label}</span><p>{index === 0 ? 'The closing balance from your history.' : `${point.incomeCents > 0 ? `${euro(point.incomeCents)} in · ` : ''}${euro(point.costCents, 2)} out (estimated)`}</p></div>
      <details className={styles.details}><summary>View daily figures</summary><div className={styles.tableScroll}><table><caption>Forecast figures; outgoings include existing saving transfers.</caption><thead><tr><th scope="col">Date</th><th scope="col">Balance</th><th scope="col">In</th><th scope="col">Out</th></tr></thead><tbody>{points.map((p, i) => <tr key={`${p.date}-${i}`}><th scope="row">{dateLabel(p.date)}{i === 0 ? ' · recorded' : ''}</th><td>{euro(p.balanceCents, 2)}</td><td>{i === 0 ? '—' : euro(p.incomeCents, 2)}</td><td>{i === 0 ? '—' : euro(p.costCents, 2)}</td></tr>)}</tbody></table></div></details>
    </>}
  </div>;
}
