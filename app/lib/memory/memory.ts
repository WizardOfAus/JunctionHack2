// Pesä's memory. Two kinds, always visible to the person:
// - learned: facts the app derives from the account and settings each time (read-only, with a source);
// - told: things the person asked Pesä to remember (stored per persona; they can delete them).
import type { Forecast, Transaction } from '../finance';
import type { Benchmarks } from '../benchmarks';
import type { MortgageView } from '../personas/view';

export type LearnedFact = { id: string; text: string; source: string };
export type ToldMemory = { id: string; text: string; createdAt: string };
export const MAX_TOLD = 30, MAX_TOLD_LENGTH = 200;
const GOALS = { home: 'a first home', buffer: 'building a safety net', understand: 'understanding your money' } as const;

/** The most common day of the month for salary payments in the last six months. */
export function paydayOfMonth(rows: Transaction[]) {
  const days = rows.filter(t => t.category === 'Salary').slice(-6).map(t => Number(t.tx_date.slice(8, 10)));
  if (!days.length) return null;
  const counts = new Map<number, number>();
  for (const d of days) counts.set(d, (counts.get(d) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

export function learnedFacts(input: { rows: Transaction[]; forecast: Forecast; comparison: Benchmarks; mortgage: MortgageView | null; goal: keyof typeof GOALS; format: (cents: number) => string }): LearnedFact[] {
  const { rows, forecast: f, comparison, mortgage, format } = input;
  const facts: LearnedFact[] = [{ id: 'goal', text: `Your direction is ${GOALS[input.goal]}.`, source: 'Your choice in the app' }];
  const payday = paydayOfMonth(rows);
  if (f.salaryCents > 0) facts.push({ id: 'salary', text: `Your salary is usually about ${format(f.salaryCents)}${payday ? `, paid around the ${payday}${[1, 21, 31].includes(payday) ? 'st' : [2, 22].includes(payday) ? 'nd' : [3, 23].includes(payday) ? 'rd' : 'th'}` : ''}.`, source: 'Salary payments in this account' });
  if (f.salarySweepCents > 0) facts.push({ id: 'sweep', text: `Most of your salary (${format(f.salarySweepCents)}) moves to another account soon after payday.`, source: 'Transfers in this account' });
  if (f.housingCents > 0) facts.push({ id: 'housing', text: `Housing costs you about ${format(f.housingCents)} a month.`, source: 'Housing payments in this account' });
  facts.push({ id: 'reserve', text: `You protect a reserve of ${format(f.protectedCents)}.`, source: 'Your plan settings' });
  for (const c of comparison.categories.filter(c => c.youCents >= c.dataset.p75 && c.youCents > 0).sort((a, b) => (b.youCents - b.dataset.p50) - (a.youCents - a.dataset.p50)).slice(0, 2))
    facts.push({ id: `benchmark-${c.category}`, text: `${c.category}: ${format(c.youCents)} a month, ${c.dataset.words} in the comparison.`, source: 'People like you (synthetic dataset)' });
  if (mortgage) facts.push({ id: 'mortgage', text: `You have a home-loan application record: ${mortgage.status === 'rejected' ? 'declined' : mortgage.status === 'approved' ? 'approved' : 'still in progress'} on ${mortgage.statusDate}.`, source: 'Historical application record' });
  return facts;
}

/** Cleans a statement the person asked Pesä to remember. Returns null when it is empty or too long. */
export function cleanTold(text: unknown) {
  if (typeof text !== 'string') return null;
  const clean = text.replace(/\s+/g, ' ').trim().replace(/^(please\s+)?remember(\s+that)?[:,]?\s*/i, '');
  if (!clean || clean.length > MAX_TOLD_LENGTH) return null;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** Detects an explicit "remember …" request in a chat message. Nothing is saved until the person confirms. */
export function rememberRequest(question: string) {
  return /^\s*(please\s+)?remember\b/i.test(question) ? cleanTold(question) : null;
}

export function memoryContext(learned: LearnedFact[], told: ToldMemory[]) {
  const lines = ['What you know about this person (they can see and edit this in the app; use it to personalise, never reveal it as surveillance):'];
  for (const f of learned) lines.push(`- ${f.text} (${f.source})`);
  if (told.length) { lines.push('They asked you to remember:'); for (const m of told) lines.push(`- ${m.text}`); }
  return lines.join('\n');
}
