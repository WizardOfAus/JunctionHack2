// Draws the small chart that comes with a coach answer. Every number is the app's own calculation.
import { CircleAlert, CircleCheck, CircleHelp } from 'lucide-react';
import type { AnswerVisual } from '@/lib/coach/visuals';
import styles from './answer-visual.module.css';

export function AnswerVisualView({ visual: v, format }: { visual: AnswerVisual; format: (cents: number) => string }) {
  return (
    <figure className={styles.visual} aria-label={v.title}>
      <figcaption>{v.title}</figcaption>
      {v.type === 'bars' ? (() => {
        const max = Math.max(1, ...v.items.map(i => i.cents));
        return <ul className={styles.bars}>{v.items.map(i => (
          <li key={i.label} data-highlight={i.highlight || undefined}>
            <span>{i.label}</span>
            <span className={styles.track}><i style={{ width: `${Math.max(2, i.cents / max * 100)}%` }} /></span>
            <strong>{format(i.cents)}</strong>
          </li>))}</ul>;
      })() : null}
      {v.type === 'compare' ? (() => {
        const max = Math.max(1, ...v.items.flatMap(i => [i.youCents, i.typicalCents]));
        return <>
          <ul className={styles.compare}>{v.items.map(i => (
            <li key={i.label}>
              <span>{i.label}</span>
              <span className={styles.pair}>
                <span className={styles.track}><i style={{ width: `${Math.max(2, i.youCents / max * 100)}%` }} /></span>
                <span className={`${styles.track} ${styles.typical}`}><i style={{ width: `${Math.max(2, i.typicalCents / max * 100)}%` }} /></span>
              </span>
              <strong>{format(i.youCents)}<small>{format(i.typicalCents)}</small></strong>
            </li>))}</ul>
          <p className={styles.legend}><span className={styles.keyYou} />You<span className={styles.keyTypical} />Typical</p>
        </>;
      })() : null}
      {v.type === 'split' ? (() => {
        const total = Math.max(1, v.segments.reduce((s, x) => s + x.cents, 0));
        return <>
          <div className={styles.split} role="img" aria-label={v.segments.map(x => `${x.label} ${format(x.cents)}`).join(', ')}>
            {v.segments.map(x => <i key={x.label} data-tone={x.tone} style={{ width: `${x.cents / total * 100}%` }} />)}
          </div>
          <ul className={styles.splitLegend}>{v.segments.map(x => <li key={x.label}><span data-tone={x.tone} />{x.label}<strong>{format(x.cents)}</strong></li>)}</ul>
        </>;
      })() : null}
      {v.type === 'checks' ? <ul className={styles.checks}>{v.items.map(i => (
        <li key={i.label} data-status={i.status}>
          {i.status === 'met' ? <CircleCheck size={17} aria-hidden="true" /> : i.status === 'short' ? <CircleAlert size={17} aria-hidden="true" /> : <CircleHelp size={17} aria-hidden="true" />}
          <span>{i.label}</span><strong>{i.detail}</strong>
        </li>))}</ul> : null}
      {v.note ? <p className={styles.note}>{v.note}</p> : null}
    </figure>
  );
}
