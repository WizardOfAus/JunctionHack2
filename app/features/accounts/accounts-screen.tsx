'use client';
// Accounts: every account Koti can see, a statement like a bank's, and the home-loan application record.
// Each figure says where it comes from: the S-Bank Junction dataset, a connected bank, or the Demo bank.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Banknote, Bus, Clapperboard, Coins, CreditCard, HeartPulse, Home, Landmark, MessageCircle, PiggyBank, Plane, Plus, Search, Shirt, ShoppingBasket, Sofa, TrendingDown, TrendingUp, Utensils, Zap, type LucideIcon } from 'lucide-react';
import { ResponsiveSheet } from '@/components/mobile/responsive-sheet';
import { addDays, HISTORY_THROUGH, type Forecast } from '@/lib/finance';
import type { MortgageView } from '@/lib/personas/view';
import type { Connection } from '@/lib/open-banking/types';
import type { LoanReadiness } from '@/lib/loan-readiness';
import { fullPicture } from '@/lib/open-banking/full-picture';
import { ConnectBankSheet, ConnectionPermissions } from '@/features/open-banking/connect-bank';
import styles from './accounts.module.css';

type Row = { id: string; tx_date: string; tx_timestamp: string; category: string; amountCents: number; balanceCents: number; transaction_type: string; mcc_code: string;
  merchant: { name: string; place: string; kind: string } | null; basket?: string };
type Line = { id: string; date: string; time?: string; title: string; subtitle: string; amountCents: number; balanceCents?: number; account: string; source: string; category?: string; icon: LucideIcon; detail: [string, string][] };
const ICONS: Record<string, LucideIcon> = { Groceries: ShoppingBasket, Restaurants: Utensils, Transportation: Bus, Entertainment: Clapperboard, Health: HeartPulse, 'Home & Tech': Sofa, Lifestyle: Shirt, Travel: Plane,
  Housing: Home, Utilities: Zap, Salary: Banknote, 'Salary Sweep': ArrowRightLeft, 'Invest Deposit': TrendingUp, 'Invest Withdraw': TrendingDown, 'Other Income': Coins };
const SBANK = 'S-Bank account';
const SBANK_SOURCE = 'S-Bank Junction 2026 dataset (synthetic)';
const DAYS = 60;

type Props = { personaId: string; assumptions: unknown; forecast: Forecast; mortgage: MortgageView | null; readiness: LoanReadiness | null; format: (cents: number, digits?: number) => string; dateLabel: (iso: string) => string; onAsk: (question: string) => void };

export function AccountsScreen({ personaId, assumptions, forecast, mortgage, readiness, format, dateLabel, onAsk }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [note, setNote] = useState('');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Line | null>(null);
  const [banner, setBanner] = useState(() => typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('bank'));
  const post = useCallback((path: string, body: unknown, signal?: AbortSignal) => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal }), []);
  useEffect(() => {
    const controller = new AbortController();
    post('/api/transactions', { query: { from: addDays(HISTORY_THROUGH, -(DAYS - 1)), to: HISTORY_THROUGH }, assumptions, personaId }, controller.signal)
      .then(r => r.json() as Promise<{ rows?: Row[]; merchantNote?: string }>).then(d => { setRows(d.rows ?? []); setNote(d.merchantNote ?? ''); }).catch(() => { if (!controller.signal.aborted) setRows([]); });
    post('/api/open-banking/connections', { personaId }, controller.signal).then(r => r.json() as Promise<{ connections?: Connection[] }>)
      .then(d => setConnections(d.connections ?? [])).catch(() => undefined);
    return () => controller.abort();
  }, [personaId, assumptions, post]);
  const revoke = async (id: string) => { await post('/api/open-banking/revoke', { personaId, id }); setConnections(c => c.filter(x => x.id !== id)); };

  const lines = useMemo<Line[]>(() => {
    const own = (rows ?? []).map((t): Line => ({ id: t.id, date: t.tx_date, time: t.tx_timestamp.slice(11, 16), title: t.merchant?.name ?? t.category, subtitle: [t.merchant?.place, t.merchant?.kind ?? t.category].filter(Boolean).join(' · '),
      amountCents: t.amountCents, balanceCents: t.balanceCents, account: SBANK, source: SBANK_SOURCE, category: t.category, icon: ICONS[t.category] ?? Landmark,
      detail: [['Category', t.category], ['Type', t.transaction_type.replaceAll('_', ' ')], ...(t.mcc_code ? [['Merchant code (MCC)', t.mcc_code] as [string, string]] : []), ...(t.basket ? [['Spending basket', t.basket] as [string, string]] : []), ['Balance after', format(t.balanceCents, 2)]] }));
    const other = connections.flatMap(c => c.transactions.map((t): Line => {
      const account = c.accounts.find(a => a.id === t.accountId);
      return { id: t.id, date: t.date, title: t.counterparty ?? t.description, subtitle: `${c.bankName} · ${account?.name ?? 'Account'}`, amountCents: t.amountCents, account: c.id, source: c.label,
        icon: account?.type === 'card' ? CreditCard : account?.type === 'savings' ? PiggyBank : Landmark, detail: [['Description', t.description], ['Status', t.status]] as [string, string][] };
    }));
    return [...own, ...other].sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? ''));
  }, [rows, connections, format]);
  const shown = lines.filter(l => (filter === 'all' || (filter === 'sbank' ? l.account === SBANK : l.account === filter)) && (!search || `${l.title} ${l.subtitle}`.toLowerCase().includes(search.toLowerCase())));
  const days = [...new Set(shown.map(l => l.date))];
  const accounts = [{ id: 'sbank', name: SBANK, bank: 'S-Bank', balanceCents: forecast.balanceCents, source: SBANK_SOURCE, icon: Landmark },
    ...connections.flatMap(c => c.accounts.map(a => ({ id: a.id, name: a.name, bank: c.bankName, balanceCents: a.balanceCents, source: c.label, icon: a.type === 'card' ? CreditCard : a.type === 'savings' ? PiggyBank : Landmark })))];
  const total = accounts.reduce((s, a) => s + (a.balanceCents ?? 0), 0);

  return (
    <section className={styles.screen} aria-labelledby="accounts-title">
      {banner ? <p className={styles.banner} role="status" data-tone={banner === 'connected' ? 'ok' : 'warn'}>{banner === 'connected' ? 'Bank connected. Its accounts now appear below.' : banner === 'cancelled' ? 'The connection was cancelled. Nothing was shared.' : 'The bank connection did not complete. Nothing was shared.'}
        <button className="text-button" onClick={() => setBanner(null)}>Dismiss</button></p> : null}
      <header className={styles.header}>
        <div><h2 id="accounts-title">Accounts</h2><p>{accounts.length > 1 ? `${format(total)} across ${accounts.length} accounts` : 'Your S-Bank account. Connect another bank to see your full picture.'}</p></div>
        <button className="button" onClick={() => setConnecting(true)}><Plus size={16} />Connect a bank</button>
      </header>
      <div className={styles.cards}>{accounts.map(a => <article key={a.id} className={styles.account}>
        <span className={styles.accountIcon}><a.icon size={18} /></span>
        <small>{a.bank}</small><strong>{a.name}</strong>
        <span className={styles.balance}>{a.balanceCents === null ? 'Balance not shared' : format(a.balanceCents, 2)}</span>
        <small className={styles.source}>{a.source}</small>
      </article>)}
        <button className={styles.addCard} onClick={() => setConnecting(true)}><Plus size={20} /><span>Connect another bank</span><small>PSD2 · read only</small></button>
      </div>
      {connections.length ? <FullPictureCard picture={fullPicture({ forecast, connections, readiness, asOf: HISTORY_THROUGH })} format={format} onAsk={onAsk} /> : null}
      {mortgage ? <MortgageCard mortgage={mortgage} format={format} dateLabel={dateLabel} onAsk={onAsk} /> : null}
      <ConnectionPermissions connections={connections} onRevoke={id => void revoke(id)} dateLabel={dateLabel} />
      <section className={styles.statement} aria-labelledby="statement-title">
        <div className={styles.statementHead}>
          <h3 id="statement-title">Statement · last {DAYS} days</h3>
          <label className={styles.search}><Search size={15} /><span className="sr-only">Search transactions</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search" /></label>
        </div>
        <div className={styles.filters} role="group" aria-label="Show account">
          {[['all', 'All'], ['sbank', 'S-Bank'], ...connections.map(c => [c.id, c.bankName])].map(([id, label]) => <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
        </div>
        {rows === null ? <div className={styles.skeleton} aria-label="Loading transactions">{[0, 1, 2, 3, 4].map(i => <span key={i} />)}</div>
          : !shown.length ? <p className={styles.empty}>No transactions match.</p>
          : days.map(day => <div key={day} className={styles.day}>
              <h4>{dateLabel(day)}</h4>
              <ul>{shown.filter(l => l.date === day).map(l => <li key={l.id}><button onClick={() => setSelected(l)}>
                <span className={styles.rowIcon}><l.icon size={17} /></span>
                <span className={styles.rowText}><strong>{l.title}</strong><small>{l.subtitle}</small></span>
                <span className={styles.rowAmount} data-in={l.amountCents > 0}>{l.amountCents > 0 ? '+' : ''}{format(l.amountCents, 2)}{l.balanceCents !== undefined ? <small>{format(l.balanceCents, 2)}</small> : null}</span>
              </button></li>)}</ul>
            </div>)}
        {note ? <p className={styles.note}>{note}</p> : null}
      </section>
      <ResponsiveSheet open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }} title={selected?.title ?? 'Transaction'} description={selected ? `${dateLabel(selected.date)}${selected.time ? ` at ${selected.time}` : ''}` : undefined}>
        {selected ? <div className={styles.detail}>
          <p className={styles.detailAmount} data-in={selected.amountCents > 0}>{selected.amountCents > 0 ? '+' : ''}{format(selected.amountCents, 2)}</p>
          <dl>{[['Account', selected.account === SBANK ? SBANK : selected.subtitle], ...selected.detail, ['Source', selected.source]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          <button className="button secondary" onClick={() => { const s = selected; setSelected(null); onAsk(`Tell me about my ${s.amountCents < 0 ? 'payment to' : 'payment from'} ${s.title} on ${s.date} (${format(Math.abs(s.amountCents), 2)}). Is it usual for me?`); }}><MessageCircle size={16} />Ask Pesä about this</button>
        </div> : null}
      </ResponsiveSheet>
      <ConnectBankSheet open={connecting} onOpenChange={setConnecting} personaId={personaId} onConnected={c => setConnections(list => [...list.filter(x => x.id !== c.id), c])} />
    </section>
  );
}

function MortgageCard({ mortgage: m, format, dateLabel, onAsk }: { mortgage: MortgageView; format: (c: number) => string; dateLabel: (iso: string) => string; onAsk: (q: string) => void }) {
  const status = m.status === 'approved' ? 'Approved' : m.status === 'rejected' ? 'Declined' : 'In progress';
  return (
    <section className={styles.mortgage} aria-labelledby="mortgage-title">
      <div className={styles.mortgageHead}>
        <div><h3 id="mortgage-title">Your home-loan application</h3><small>Historical application record {m.applicationId}</small></div>
        <span className={styles.pill} data-status={m.status}>{status}</span>
      </div>
      <dl className={styles.figures}>
        {[['Price', m.priceCents], ['Loan', m.loanCents], ['Own funds', m.equityCents]].map(([k, v]) => <div key={k as string}><dt>{k as string}</dt><dd>{v === null ? '—' : format(v as number)}</dd></div>)}
      </dl>
      {m.rejectionReason ? <p className={styles.reason}>Recorded reason: {m.rejectionReason.replaceAll('_', ' ')}</p> : null}
      <ol className={styles.timeline}>{m.timeline.map((e, i) => <li key={i}><span /><div><strong>{e.eventType.replaceAll('_', ' ')}</strong><small>{dateLabel(e.date.slice(0, 10))}{e.note ? ` · ${e.note}` : ''}</small></div></li>)}</ol>
      <button className="text-button" onClick={() => onAsk(m.status === 'rejected' ? 'Why was my mortgage declined, and what would it take?' : 'What does my home-loan application mean for my plan?')}><MessageCircle size={14} />Ask Pesä what it means</button>
    </section>
  );
}

function FullPictureCard({ picture: p, format, onAsk }: { picture: ReturnType<typeof fullPicture>; format: (c: number) => string; onAsk: (q: string) => void }) {
  return (
    <section className={styles.picture} aria-labelledby="picture-title">
      <h3 id="picture-title">Your full picture</h3>
      <dl className={styles.figures}>
        <div><dt>Cash you can see</dt><dd>{format(p.cashCents)}</dd></div>
        <div><dt>Card balance owed</dt><dd>{format(p.cardOwedCents)}</dd></div>
        <div><dt>Card spending a month</dt><dd>{format(p.cardMonthlySpendCents)}</dd></div>
      </dl>
      {p.deposit ? <p className={styles.check} data-ok={p.deposit.coveredByVisibleCash}>{p.deposit.coveredByVisibleCash ? '✓' : '•'} The home deposit the loan cap needs is {format(p.deposit.neededCents)}. Cash across your accounts {p.deposit.coveredByVisibleCash ? 'covers it' : 'does not cover it yet'}.</p> : null}
      <p className={styles.note}>Sources: {p.sources.join('; ')}. {p.notes.join(' ')}</p>
      <button className="text-button" onClick={() => onAsk('Looking at all my connected accounts, how does my full picture change my plan?')}><MessageCircle size={14} />Ask Pesä about my full picture</button>
    </section>
  );
}
