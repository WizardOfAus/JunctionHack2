// Small visuals that travel with a coach answer, so the person sees the figures without leaving the chat.
// Built only from the app's own calculation for that answer; the model never draws or invents them.
import type { Basket, Forecast, Transaction } from '../finance';
import type { Benchmarks } from '../benchmarks';
import type { LoanReadiness } from '../loan-readiness';
import type { Calculated } from './calculated';

export type AnswerVisual =
  | { type: 'bars'; title: string; items: { label: string; cents: number; highlight?: boolean }[]; note?: string }
  | { type: 'compare'; title: string; items: { label: string; youCents: number; typicalCents: number }[]; note: string }
  | { type: 'split'; title: string; segments: { label: string; cents: number; tone: 'forest' | 'lilac' | 'lime' | 'peach' }[]; note?: string }
  | { type: 'checks'; title: string; items: { label: string; status: 'met' | 'short' | 'unknown'; detail: string }[]; note: string };

export type VisualInput = {
  calc: Calculated;
  forecast: Forecast;
  comparison: Benchmarks;
  readiness: LoanReadiness;
  /** Consumption rows in the recent window, each with its basket after the user's corrections. */
  window: { category: string; basket: Basket; spentCents: number }[];
  months: number;
  transactions: Transaction[];
  format: (cents: number) => string;
};

const monthLabel = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });

/** Monthly totals for one category (or a taxi MCC) over the six months up to the answer's period. */
function monthly(rows: Transaction[], to: string, match: (t: Transaction) => boolean) {
  const end = new Date(`${to.slice(0, 7)}-15T12:00:00Z`);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 5 + i, 15)).toISOString().slice(0, 7);
    return { ym: d, cents: rows.filter(t => t.tx_date.startsWith(d) && t.amountCents < 0 && match(t)).reduce((s, t) => s - t.amountCents, 0) };
  });
}

export function answerVisual(input: VisualInput): AnswerVisual | null {
  const { calc, forecast: f, comparison, readiness: r, format } = input;
  switch (calc.intent) {
    case 'basket': {
      if (!calc.basket) return null;
      const byCategory = new Map<string, number>();
      for (const row of input.window) if (row.basket === calc.basket) byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + row.spentCents);
      const items = [...byCategory].map(([label, cents]) => ({ label, cents: Math.round(cents / input.months) })).sort((a, b) => b.cents - a.cents).slice(0, 6);
      return items.length ? { type: 'bars', title: `${calc.basket === 'regular' ? 'Everyday essentials' : calc.basket === 'irregular' ? 'Life’s little surprises' : 'Your kind of everyday'} · per month`, items, note: `${f.recentPeriod} average, with your basket changes.` } : null;
    }
    case 'benchmark': {
      const picked = calc.category ? comparison.categories.filter(c => c.category === calc.category)
        : [...comparison.categories].filter(c => c.youCents > 0).sort((a, b) => Math.abs(b.youCents - b.dataset.p50) - Math.abs(a.youCents - a.dataset.p50)).slice(0, 4);
      return picked.length ? { type: 'compare', title: 'You compared with people like you · per month', items: picked.map(c => ({ label: c.category, youCents: c.youCents, typicalCents: c.dataset.p50 })), note: 'Typical = median of the synthetic dataset. A comparison, not a judgement.' } : null;
    }
    case 'restaurant_scenario': {
      if (calc.reductionPercent === undefined || !calc.from || !calc.to) return null;
      const spent = input.transactions.filter(t => t.tx_date >= calc.from! && t.tx_date <= calc.to! && t.category === 'Restaurants' && t.amountCents < 0).reduce((s, t) => s - t.amountCents, 0);
      const months = (Number(calc.to.slice(0, 4)) - Number(calc.from.slice(0, 4))) * 12 + Number(calc.to.slice(5, 7)) - Number(calc.from.slice(5, 7)) + 1;
      const now = Math.round(spent / months), freed = Math.round(now * calc.reductionPercent / 100);
      return { type: 'bars', title: `Eating out with ${calc.reductionPercent}% less · per month`, items: [{ label: 'Now', cents: now }, { label: 'With the change', cents: now - freed, highlight: true }], note: `${format(freed)} a month freed up. A projection, not money already saved.` };
    }
    case 'taxi': case 'restaurant_spending': case 'category_spending': {
      if (!calc.to || calc.category === undefined && calc.intent !== 'taxi') return null;
      const match = calc.intent === 'taxi' ? (t: Transaction) => t.mcc_code === '4121' : (t: Transaction) => t.category === calc.category;
      const series = monthly(input.transactions, calc.to, match);
      if (!series.some(m => m.cents > 0)) return null;
      return { type: 'bars', title: `${calc.intent === 'taxi' ? 'Taxis' : calc.category} · last six months`, items: series.map(m => ({ label: monthLabel(m.ym), cents: m.cents, highlight: m.ym === calc.to!.slice(0, 7) })) };
    }
    case 'forecast':
      return { type: 'split', title: `Your balance of ${format(f.balanceCents)}`, segments: [
        { label: 'Expected costs', cents: Math.max(0, f.balanceCents - f.protectedCents - Math.max(0, f.remainingCents)), tone: 'lilac' },
        { label: 'Protected reserve', cents: f.protectedCents, tone: 'forest' },
        { label: 'Free to use', cents: Math.max(0, f.remainingCents), tone: 'lime' },
      ], note: `Over the next ${f.horizonDays} days. A balance is not the same as room to spend.` };
    case 'readiness':
      return { type: 'checks', title: 'Home loan readiness', items: r.checks.map(c => ({ label: c.label, status: c.status,
        detail: 'gapCents' in c && c.gapCents ? `${format(c.gapCents)} short` : 'valueMonths' in c && c.valueMonths != null ? `${c.valueMonths} months covered` : c.status === 'met' ? 'Met' : 'Not known' })),
        note: 'Education, not a credit decision. Banks use their own criteria.' };
    default:
      return null;
  }
}
