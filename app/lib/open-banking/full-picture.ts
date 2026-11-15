// The full picture across connected banks. It adds what each connection shows, with its source, and
// compares visible cash with the deposit the loan cap needs. It never changes the application record
// or the single-account loan readiness checks.
import type { Forecast } from '../finance';
import type { LoanReadiness } from '../loan-readiness';
import type { Connection } from './types';

export const SBANK_SOURCE = 'S-Bank Junction 2026 dataset (synthetic)';

export function fullPicture(input: { forecast: Forecast; connections: Connection[]; readiness: LoanReadiness | null; asOf: string }) {
  const { forecast: f, connections, readiness } = input;
  const accounts = [{ bank: 'S-Bank', name: 'S-Bank account', type: 'current' as const, balanceCents: f.balanceCents, source: SBANK_SOURCE },
    ...connections.flatMap(c => c.accounts.map(a => ({ bank: c.bankName, name: a.name, type: a.type, balanceCents: a.balanceCents, source: c.label })))];
  const known = accounts.filter(a => a.balanceCents !== null) as (typeof accounts[number] & { balanceCents: number })[];
  const cashCents = known.filter(a => a.type !== 'card').reduce((s, a) => s + a.balanceCents, 0);
  const cardOwedCents = -known.filter(a => a.type === 'card').reduce((s, a) => s + Math.min(0, a.balanceCents), 0);
  // Card spending over the last 90 days of connected data, as a monthly mean.
  const since = new Date(Date.parse(`${input.asOf}T12:00:00Z`) - 90 * 86400000).toISOString().slice(0, 10);
  const cardIds = new Set(connections.flatMap(c => c.accounts.filter(a => a.type === 'card').map(a => a.id)));
  const cardSpend = connections.flatMap(c => c.transactions).filter(t => cardIds.has(t.accountId) && t.amountCents < 0 && t.date > since && !/bill paid|repayment/i.test(t.description));
  const deposit = readiness?.checks.find(c => c.id === 'deposit') as { targetCents: number } | undefined;
  return {
    label: 'Full picture across connected accounts' as const,
    accounts, cashCents, cardOwedCents, cardMonthlySpendCents: Math.round(cardSpend.reduce((s, t) => s - t.amountCents, 0) / 3),
    deposit: deposit ? { neededCents: deposit.targetCents, visibleCashCents: cashCents, coveredByVisibleCash: cashCents >= deposit.targetCents } : null,
    sources: [...new Set(accounts.map(a => a.source))],
    simulated: connections.some(c => c.provider === 'demo'),
    notes: [
      'Balances are as each source reports them. A simulated Demo bank is not real money.',
      'This does not change your application record or the loan readiness checks for this account; banks decide on their own criteria.',
    ],
  };
}
export type FullPicture = ReturnType<typeof fullPicture>;

/** Plain-text block for the coach agent. */
export function fullPictureContext(p: FullPicture, format: (cents: number) => string) {
  const lines = [`${p.label} (quote these figures; each has a source; do not recalculate):`];
  for (const a of p.accounts) lines.push(`- ${a.bank} ${a.name}: ${a.balanceCents === null ? 'balance not shared' : format(a.balanceCents)} (${a.source})`);
  lines.push(`- Cash visible across accounts: ${format(p.cashCents)}. Card balance owed: ${format(p.cardOwedCents)}. Card spending about ${format(p.cardMonthlySpendCents)} a month.`);
  if (p.deposit) lines.push(`- Deposit the loan cap needs: ${format(p.deposit.neededCents)}; visible cash ${p.deposit.coveredByVisibleCash ? 'covers it' : 'does not cover it yet'}.`);
  if (p.simulated) lines.push('- The Demo bank is simulated. Say so whenever you use its figures.');
  lines.push(...p.notes.map(n => `- ${n}`));
  return lines.join('\n');
}
