'use client';
// Connect another bank (PSD2 account information): choose a bank, read exactly what is shared, then
// log in on the bank's own page. The Demo bank connects at once and is always labelled simulated.
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Landmark, Lock, ShieldOff } from 'lucide-react';
import { ResponsiveSheet } from '@/components/mobile/responsive-sheet';
import type { Bank, Connection } from '@/lib/open-banking/types';
import styles from './open-banking.module.css';

type Step = { kind: 'choose' } | { kind: 'consent'; bank: Bank } | { kind: 'working'; bank: Bank } | { kind: 'error'; message: string };

export function ConnectBankSheet({ open, onOpenChange, personaId, onConnected }: { open: boolean; onOpenChange: (open: boolean) => void; personaId: string; onConnected: (connection: Connection) => void }) {
  const operation = useRef<AbortController | null>(null);
  useEffect(()=>()=>operation.current?.abort(),[]);
  const [banks, setBanks] = useState<{ banks: Bank[]; note: string | null } | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'choose' });
  useEffect(() => {
    if (!open || banks) return;
    const controller = new AbortController();
    fetch('/api/open-banking/banks', { signal: controller.signal }).then(r => r.json() as Promise<{ banks: Bank[]; note: string | null }>).then(setBanks).catch(() => { if (!controller.signal.aborted) setBanks({ banks: [], note: 'Banks could not be loaded.' }); });
    return () => controller.abort();
  }, [open, banks]);
  const close = (next: boolean) => { onOpenChange(next); if (!next) {operation.current?.abort();setStep({kind:'choose'});} };

  async function connect(bank: Bank) {
    operation.current?.abort();
    const current=new AbortController();operation.current=current;
    setStep({ kind: 'working', bank });
    try {
      const response = await fetch('/api/open-banking/connect', { method: 'POST', headers: { 'content-type': 'application/json' }, signal:current.signal, body: JSON.stringify({ personaId, provider: bank.provider, bank: bank.provider === 'demo' ? undefined : bank.name }) });
      const data = await response.json() as { connection?: Connection; redirectUrl?: string; error?: string };
      if(current.signal.aborted)return;
      if (!response.ok) throw new Error(data.error);
      if (data.redirectUrl) { window.location.assign(data.redirectUrl); return; }
      if (data.connection) { onConnected(data.connection); close(false); }
    } catch (error) { if(current.signal.aborted)return;setStep({ kind: 'error', message: error instanceof Error && error.message ? error.message : 'That bank could not be connected. Try again.' }); }
  }

  return (
    <ResponsiveSheet open={open} onOpenChange={close} title={step.kind === 'consent' || step.kind === 'working' ? `Connect ${step.bank.name}` : 'Connect another bank'}
      description="Under PSD2, you can let Koti read your accounts at other banks, with your consent.">
      {step.kind === 'choose' ? <div className={styles.banks}>
        {!banks ? <p className={styles.note}>Loading banks…</p> : banks.banks.map(bank => (
          <button key={`${bank.provider}:${bank.name}`} className={styles.bank} onClick={() => setStep({ kind: 'consent', bank })}>
            {bank.logo ? <img src={bank.logo} alt="" width={36} height={36} /> : <span className={styles.logo}><Landmark size={18} /></span>}
            <span><strong>{bank.name}</strong><small>{bank.provider === 'demo' ? 'Simulated · always available' : 'Bank sandbox via Enable Banking'}</small></span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>))}
        {banks?.note ? <p className={styles.note}>{banks.note}</p> : null}
      </div> : null}
      {step.kind === 'consent' || step.kind === 'working' ? <div className={styles.consent}>
        <h3>Koti will be able to see</h3>
        <ul className={styles.yes}>{['Your accounts and their names', 'Balances', 'Transactions from the last 180 days'].map(t => <li key={t}><Check size={15} />{t}</li>)}</ul>
        <h3>Koti can never</h3>
        <ul className={styles.no}>{['Make payments or move money', 'See your bank login details'].map(t => <li key={t}><ShieldOff size={15} />{t}</li>)}</ul>
        <p className={styles.note}><Lock size={13} /> We request up to 90 days of read-only access. Your bank may shorten it or ask you to authenticate sooner. This local demo keeps connections only until its server restarts. Pesä can use connected sandbox balances when you ask a question.
          {step.bank.provider === 'demo' ? ' The Demo bank is simulated: its accounts are made up for this demo.' : ` You will log in on ${step.bank.name}’s own page (sandbox).`}</p>
        <button className="button" disabled={step.kind === 'working'} onClick={() => void connect(step.bank)}>{step.kind === 'working' ? 'Connecting…' : step.bank.provider === 'demo' ? 'Connect the Demo bank' : `Continue to ${step.bank.name}`}<ArrowRight size={16} /></button>
        <button className="text-button" disabled={step.kind==='working'} onClick={() => setStep({ kind: 'choose' })}>Choose another bank</button>
      </div> : null}
      {step.kind === 'error' ? <div className={styles.consent}><p>{step.message}</p><button className="button secondary" onClick={() => setStep({ kind: 'choose' })}>Back to banks</button></div> : null}
    </ResponsiveSheet>
  );
}

/** Each consent, how long it lasts, and a way to revoke it (the PSD3-style permissions view). */
export function ConnectionPermissions({ connections, onRevoke, dateLabel }: { connections: Connection[]; onRevoke: (id: string) => void; dateLabel: (iso: string) => string }) {
  if (!connections.length) return null;
  return (
    <section className={styles.permissions} aria-labelledby="permissions-title">
      <h3 id="permissions-title">Connected banks</h3>
      <ul>{connections.map(c => (
        <li key={c.id}>
          <span><strong>{c.bankName}</strong><small>{c.label} · {c.accounts.length} account{c.accounts.length === 1 ? '' : 's'} · read only · until {dateLabel(c.validUntil.slice(0, 10))}</small></span>
          <button className="text-button" onClick={() => onRevoke(c.id)}>Revoke</button>
        </li>))}</ul>
    </section>
  );
}
