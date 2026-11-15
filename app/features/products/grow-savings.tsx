'use client';
// Grow your savings: Finland's main options explained neutrally, ordered for this person's situation,
// with S-Bank's current terms (checked live via Exa, with citations). Information, not investment advice.
import { useEffect, useState } from 'react';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import { suggest, type LiveProduct, type ProductId, type ProductInfo } from '@/lib/products/catalogue';
import type { JourneyContext } from '@/lib/journey/context';
import styles from './grow-savings.module.css';

type Data = { products: Record<ProductId, ProductInfo>; sBank: { products: LiveProduct[]; checkedAt: string; source: 'live' | 'cached'; note: string }; label: string };
const RISK = { none: 'No market risk', low: 'Low risk', medium: 'Value goes up and down', high: 'Higher risk' } as const;

export function GrowSavings({ goal, bufferMonths, dateLabel }: { goal: JourneyContext['goal']; bufferMonths: number | null; dateLabel: (iso: string) => string }) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/products', { signal: controller.signal }).then(r => r.json() as Promise<Data>).then(setData).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []);
  const order = suggest({ goal, bufferMonths });
  return (
    <section className={styles.section} aria-labelledby="grow-title">
      <header><h2 id="grow-title">Grow your savings</h2><p>Finland’s main options, in an order that fits your situation. Information, not investment advice.</p></header>
      {failed ? <p className={styles.note}>Savings options could not be loaded.</p> : !data ? <div className={styles.skeleton}><span /><span /></div> : <>
        <ol className={styles.list}>{order.map(({ id, reason }, i) => {
          const p = data.products[id], live = data.sBank.products.filter(x => x.kind === id);
          return <li key={id} className={styles.card} data-first={i === 0}>
            <div className={styles.head}><span className={styles.rank}>{i + 1}</span><div><h3>{p.name}</h3><small>{p.finnish}</small></div><span className={styles.risk} data-risk={p.risk}>{RISK[p.risk]}</span></div>
            <p className={styles.reason}>{reason}</p>
            <p>{p.what}</p>
            <dl><div><dt>Tax</dt><dd>{p.tax}</dd></div><div><dt>Limits</dt><dd>{p.limits}</dd></div><div><dt>Access</dt><dd>{p.access}</dd></div></dl>
            {live.length ? <div className={styles.live}>{live.map(l => <p key={l.url}><ShieldCheck size={14} /><span><strong>At S-Bank: {l.product}</strong>{l.rateOrFee ? ` · ${l.rateOrFee}` : ''}{l.conditions ? `. ${l.conditions}` : ''} <a href={l.citations[0]} target="_blank" rel="noreferrer">s-pankki.fi<ArrowUpRight size={12} /></a></span></p>)}</div> : null}
            <a className={styles.source} href={p.sourceUrl} target="_blank" rel="noreferrer">{p.source}<ArrowUpRight size={12} /></a>
          </li>;
        })}</ol>
        <p className={styles.note}>S-Bank terms {data.sBank.source === 'live' ? 'checked live' : 'from a cached check'} on {dateLabel(data.sBank.checkedAt)} (real date, separate from the demo date). {data.sBank.note}</p>
      </>}
    </section>
  );
}
