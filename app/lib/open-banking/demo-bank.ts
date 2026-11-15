// The Demo bank: a deterministic, clearly simulated second bank for each persona (a savings account
// and a credit card). It is not derived from, or presented as, the destination of any real transfer.
import { addDays, type Clock } from '../finance';
import { CONSENT_DAYS, SCOPE, type Connection, type ConnectedTransaction } from './types';

export const DEMO_BANK = { provider: 'demo' as const, name: 'Demo bank', country: 'FI', sandbox: true };

/** Small seeded generator, so the same persona always sees the same Demo bank. */
function random(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}
const CARD_SPEND = [['Grocery store', 1500, 9000], ['Café', 350, 1200], ['Fuel station', 3000, 7000], ['Streaming service', 999, 1599], ['Pharmacy', 800, 4000], ['Online shop', 1500, 12000], ['Restaurant', 1800, 6500]] as const;

export function demoConnection(personaId: string, clock: Clock, now: Date): Connection {
  const rand = random(`koti-demo-bank:${personaId}`), cents = (lo: number, hi: number) => Math.round(lo + rand() * (hi - lo));
  const end = clock.historyThrough, start = addDays(end, -179);
  const savingsId = `demo-${personaId}-savings`, cardId = `demo-${personaId}-card`;
  const tx: ConnectedTransaction[] = [];
  const monthly = cents(15000, 50000);
  let savings = cents(200000, 900000);
  // Monthly saving on the 20th, and a small interest credit each quarter.
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const day = Number(d.slice(8, 10)), month = Number(d.slice(5, 7));
    if (day === 20) { tx.push({ id: `${savingsId}-${d}`, accountId: savingsId, date: d, amountCents: monthly, description: 'Monthly saving', status: 'booked' }); savings += monthly; }
    if (day === 1 && month % 3 === 1) { const interest = Math.round(savings * 0.0045); tx.push({ id: `${savingsId}-int-${d}`, accountId: savingsId, date: d, amountCents: interest, description: 'Interest', status: 'booked' }); savings += interest; }
    if (rand() < 0.33) { const [name, lo, hi] = CARD_SPEND[Math.floor(rand() * CARD_SPEND.length)]; tx.push({ id: `${cardId}-${d}-${tx.length}`, accountId: cardId, date: d, amountCents: -cents(lo, hi), description: name, counterparty: name, status: 'booked' }); }
    if (day === 5) tx.push({ id: `${cardId}-repay-${d}`, accountId: cardId, date: d, amountCents: 0, description: 'Card bill paid', status: 'booked' });
  }
  // Each bill on the 5th repays the previous month's card spending.
  const card = tx.filter(t => t.accountId === cardId);
  for (const bill of card.filter(t => t.description === 'Card bill paid')) {
    // The first month has no earlier statement to pay.
    if (bill.date.slice(0, 7) === start.slice(0, 7)) continue;
    const prev = new Date(Date.UTC(Number(bill.date.slice(0, 4)), Number(bill.date.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
    bill.amountCents = -card.filter(t => t.date.startsWith(prev) && t.amountCents < 0 && t.description !== 'Card bill paid').reduce((s, t) => s + t.amountCents, 0);
  }
  const cardBalance = card.reduce((s, t) => s + t.amountCents, 0);
  const transactions = tx.filter(t => t.amountCents !== 0).sort((a, b) => b.date.localeCompare(a.date));
  return {
    id: `demo-${personaId}`, provider: 'demo', bankName: DEMO_BANK.name, label: 'Demo bank (simulated)',
    connectedAt: now.toISOString(), validUntil: new Date(now.getTime() + CONSENT_DAYS * 86400000).toISOString(), scope: SCOPE,
    accounts: [
      { id: savingsId, name: 'Savings account', type: 'savings', iban: 'FI00 DEMO 0000 0000 01', currency: 'EUR', balanceCents: savings, balanceDate: end },
      { id: cardId, name: 'Credit card', type: 'card', currency: 'EUR', balanceCents: Math.min(0, cardBalance), balanceDate: end },
    ],
    transactions,
  };
}
