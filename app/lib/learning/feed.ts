// The Learn feed: short cards built from the person's own figures, picked by goal and mastery.
// Every number comes from the app's calculations (forecast, benchmarks, loan readiness).
import type { Forecast } from '../finance';
import type { Benchmarks } from '../benchmarks';
import type { LoanReadiness } from '../loan-readiness';

export type ConceptId = 'room' | 'reserve' | 'baskets' | 'compare' | 'loan-cap' | 'stress' | 'asp' | 'share-savings';
export type Goal = 'home' | 'buffer' | 'understand';
export const concepts: Record<ConceptId, string> = {
  room: 'Balance vs spending room', reserve: 'Your safety reserve', baskets: 'Three spending baskets', compare: 'Comparing with others',
  'loan-cap': 'The 95% loan cap', stress: 'The stress-test rate', asp: 'ASP home saving', 'share-savings': 'Share savings account',
};
const ORDER: Record<Goal, ConceptId[]> = {
  home: ['room', 'loan-cap', 'stress', 'asp', 'reserve', 'baskets', 'compare', 'share-savings'],
  buffer: ['room', 'reserve', 'baskets', 'compare', 'share-savings', 'asp', 'loan-cap', 'stress'],
  understand: ['room', 'baskets', 'compare', 'reserve', 'asp', 'share-savings', 'loan-cap', 'stress'],
};

export type Option = { label: string; correct: boolean };
export type Card =
  | { id: string; conceptId: ConceptId; kind: 'predict'; title: string; prompt: string; answerCents: number; maxCents: number; explain: string }
  | { id: string; conceptId: ConceptId; kind: 'quiz'; title: string; prompt: string; options: Option[]; explain: string; sourceUrl?: string }
  | { id: string; conceptId: ConceptId; kind: 'concept'; title: string; body: string; source: string; sourceUrl: string };

/** Leitner box per concept: 0 new or missed, 3 mastered. */
export type Mastery = Partial<Record<ConceptId, { box: number; seenAt: number }>>;
export const MASTERED = 3;

export function updateMastery(m: Mastery, conceptId: ConceptId, correct: boolean, now = Date.now()): Mastery {
  const box = correct ? Math.min(MASTERED, (m[conceptId]?.box ?? 0) + 1) : 0;
  return { ...m, [conceptId]: { box, seenAt: now } };
}

/** A predict card counts as correct when the guess is within 20% of the real figure (or €20). */
export const closeEnough = (guess: number, answer: number) => Math.abs(guess - answer) <= Math.max(2000, Math.abs(answer) * 0.2);

// Options keep a fixed order derived from the values, so a re-render never reshuffles them.
const options = (correct: string, wrong: string[]): Option[] =>
  [{ label: correct, correct: true }, ...wrong.filter((w, i, all) => w !== correct && all.indexOf(w) === i).map(label => ({ label, correct: false }))].sort((a, b) => a.label.localeCompare(b.label));

export function cardsFor(conceptId: ConceptId, d: { forecast: Forecast; comparison: Benchmarks | null; readiness: LoanReadiness | null; format: (cents: number) => string }): Card[] {
  const { forecast: f, comparison, readiness: r, format } = d;
  switch (conceptId) {
    case 'room': return f.balanceCents > 0 ? [{ id: 'room-predict', conceptId, kind: 'predict', title: 'Balance vs spending room',
      prompt: `Your balance is ${format(f.balanceCents)}. Including expected income and costs, guess your spending room over the next ${f.horizonDays} days.`, answerCents: Math.max(0, f.remainingCents), maxCents: Math.max(f.balanceCents, f.remainingCents),
      explain: `After the costs the app expects and your protected reserve of ${format(f.protectedCents)}, about ${format(Math.max(0, f.remainingCents))} is free. A balance is not the same as room to spend.` }] : [];
    case 'reserve': {
      const essentials = f.baskets.regular;
      if (essentials <= 0) return [];
      const months = Math.floor(f.protectedCents * 10 / essentials) / 10;
      return [{ id: 'reserve-quiz', conceptId, kind: 'quiz', title: 'Your safety reserve',
        prompt: `Your everyday essentials average ${format(essentials)} a month. About how many months would your ${format(f.protectedCents)} reserve cover?`,
        options: options(`${months} months`, [`${Math.round(months * 2 * 10) / 10} months`, `${Math.max(0.5, Math.round(months / 2 * 10) / 10)} months`, `${Math.round((months + 3) * 10) / 10} months`]),
        explain: `${format(f.protectedCents)} ÷ ${format(essentials)} ≈ ${months} months. Many people aim for about three months of essentials.` }];
    }
    case 'baskets': return f.baskets.flexible > 0 ? [{ id: 'baskets-predict', conceptId, kind: 'predict', title: 'Your kind of everyday',
      prompt: 'Guess how much you spend a month on flexible things: restaurants, travel, entertainment and other choices.', answerCents: f.baskets.flexible, maxCents: Math.max(50000, f.baskets.flexible * 2),
      explain: `Your flexible basket averages ${format(f.baskets.flexible)} a month over ${f.recentPeriod}. It is the easiest part to adjust, and it is also where the fun lives.` }] : [];
    case 'compare': {
      const c = comparison?.categories.filter(x => x.youCents > 0).sort((a, b) => Math.abs(b.youCents - b.dataset.p50) - Math.abs(a.youCents - a.dataset.p50))[0];
      if (!c) return [];
      const correct = c.youCents >= c.dataset.p75 ? 'Higher than most people' : c.youCents > c.dataset.p25 ? 'About typical' : 'Lower than most people';
      return [{ id: 'compare-quiz', conceptId, kind: 'quiz', title: 'Comparing with others',
        prompt: `You spend ${format(c.youCents)} a month on ${c.category.toLowerCase()}. How does that compare with people in the dataset?`,
        options: options(correct, ['Higher than most people', 'About typical', 'Lower than most people']),
        explain: `The middle of the dataset is ${format(c.dataset.p50)}. You are ${c.dataset.words}. A comparison describes; it does not judge.` }];
    }
    case 'loan-cap': {
      if (!r || r.basis.priceCents <= 0) return [];
      const deposit=r.checks.find(c=>c.id==='deposit');
      if (!deposit || typeof deposit.targetCents !== 'number') return [];
      const p = r.basis.priceCents, pct = (n: number) => format(Math.ceil(p * n / 100));
      return [{ id: 'loan-cap-quiz', conceptId, kind: 'quiz', title: 'The 95% loan cap',
        prompt: `For this ${format(p)} home, the app assumes the home's collateral value equals its price and you provide no extra collateral. What own-funds amount does its 95% illustration use?`,
        options: options(format(deposit.targetCents), [pct(10), pct(15), pct(20)]),
        sourceUrl: deposit.source,
        explain: `The app's illustration uses ${format(deposit.targetCents)} of own funds. Finland's loan cap relates the loan to accepted collateral value, not a universal cash deposit. Extra collateral and the bank's valuation can change what is needed. Education, not a credit decision.` }];
    }
    case 'stress': {
      if (!r || r.basis.loanCents <= 0) return [];
      const s = r.payments.stress.monthlyCents;
      return [{ id: 'stress-quiz', conceptId, kind: 'quiz', title: 'The stress-test rate',
        prompt: `Lenders check you could still pay if rates rose. At 6% over 25 years, the monthly payment on a ${format(r.basis.loanCents)} loan is about…`,
        options: options(format(s), [format(Math.round(s * 0.6)), format(Math.round(s * 1.4)), format(Math.round(s * 0.8))]),
        explain: `About ${format(s)} a month at 6%.${r.payments.market ? ` At the Bank of Finland's ${r.payments.market.month} average new-loan rate of ${r.payments.market.annualPercent}%, the app calculates ${format(r.payments.market.monthlyCents)}. This is a dated observation, not a live quote.` : ''} The test asks whether you could cope with the higher figure.` }];
    }
    case 'asp': return [{ id: 'asp-concept', conceptId, kind: 'concept', title: 'ASP home saving',
      body: 'ASP is Finland’s state-supported way to save for a first home. You save regularly into an ASP account, and when you buy you can get an ASP loan with a state guarantee and interest support. The rules were renewed on 1 June 2026, so check the current terms before you start.',
      source: 'State Treasury (Valtiokonttori)', sourceUrl: 'https://www.valtiokonttori.fi/' }];
    case 'share-savings': return [{ id: 'share-savings-concept', conceptId, kind: 'concept', title: 'Share savings account',
      body: 'An osakesäästötili lets you buy and sell listed shares without paying tax on gains or dividends until you withdraw. Deposits are capped at €100,000 and each person can have one. Shares can fall in value, so it suits money you will not need soon.',
      source: 'Finnish Tax Administration (vero.fi)', sourceUrl: 'https://www.vero.fi/' }];
  }
}

/** Today's feed: unmastered concepts in goal order, least-mastered first; reviews when all are mastered. */
export function buildFeed(input: { goal: Goal; mastery: Mastery; forecast: Forecast; comparison: Benchmarks | null; readiness: LoanReadiness | null; format: (cents: number) => string; size?: number }) {
  const order = ORDER[input.goal];
  const box = (id: ConceptId) => input.mastery[id]?.box ?? 0;
  const open = order.filter(id => box(id) < MASTERED).sort((a, b) => box(a) - box(b) || order.indexOf(a) - order.indexOf(b));
  const review = order.filter(id => box(id) >= MASTERED).sort((a, b) => (input.mastery[a]?.seenAt ?? 0) - (input.mastery[b]?.seenAt ?? 0));
  return [...open, ...review].flatMap(id => cardsFor(id, input)).slice(0, input.size ?? 5);
}

export const masteredCount = (m: Mastery) => (Object.keys(concepts) as ConceptId[]).filter(id => (m[id]?.box ?? 0) >= MASTERED).length;
