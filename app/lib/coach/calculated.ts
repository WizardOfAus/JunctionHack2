// Calculated coach answers: the app's own figures for the questions it can compute.
// The demo coach replies with them directly. In agent mode they go into the app context:
// authoritative when the question and its parameters clearly match, otherwise as relevant facts,
// so the agent never refuses (or contradicts) a figure the app can calculate.
import { summarise, euro, evaluateAsp, basketOf, isConsumption, recentWindow, latestMonthPeriod, DATA_START, HISTORY_THROUGH, CLOCK, type Assumptions, type Basket, type BasketProfile, type Forecast, type Transaction } from '../finance';
import { matchCategory, spendingCategories } from '../categories';
import { readinessAnswer, type LoanReadiness } from '../loan-readiness';
import { benchmarkAnswer, type Benchmarks } from '../benchmarks';
import type { MortgageView } from '../personas/view';
import type { CoachAction, JourneyContext } from '../journey/context';

export type CalculatedInput = {
  question: string;
  transactions: Transaction[];
  customerId: string;
  assumptions: Assumptions;
  forecast: Forecast;
  profile: BasketProfile;
  readiness: LoanReadiness;
  mortgage: MortgageView | null;
  comparison: Benchmarks;
  context: JourneyContext;
  actions: CoachAction[];
};
export type Intent = 'journey'|'benchmark'|'basket'|'asp'|'readiness'|'taxi'|'restaurant_scenario'|'restaurant_spending'|'forecast'|'investments'|'category_spending'|'validation'|'unsupported';
export type Calculated = {
  intent: Intent;
  /** True only when the question and its parameters match this calculation exactly. */
  authoritative: boolean;
  text: string;
  kind: string;
  category?: string; basket?: Basket; from?: string; to?: string;
  evidence: string[];
  reductionPercent?: number;
};

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const readable = (iso:string) => new Date(iso+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
/** Asks for an amount of past spending. */
const SPEND_QUESTION = /how much|spent|spend(ing)?\b|total|cost/;
/** Asks for less spending. "More", "afford" and "increase" never become a reduction. */
const REDUCTION = /\b(less|cut|cutting|reduce|reducing|lower|fewer|drop|skip)\b/;
const PERCENT = /(-?\d+(?:[.,]\d+)?)\s*%/;
const ADVICE_OR_FUTURE = /next month|\b(will|should|more|increase)\b|afford|how (can|do) i/;
const WEB_TOPIC = /\b(today|current|currently|latest|euribor|offers?|campaign|news)\b/;

export function calculatedAnswer(input: CalculatedInput): Calculated {
  const { transactions: rows, assumptions: a, forecast: f, profile, customerId } = input;
  const q = input.question.toLowerCase();
  const matched = matchCategory(q);
  const isSpendingCategory = (spendingCategories as readonly string[]).includes(matched || '');
  const recent = recentWindow();
  let { from, to } = recent;
  const month = MONTHS.findIndex(m => q.includes(m));
  // A month name means its latest complete occurrence in the history; the default window's own label keeps the default.
  if (month >= 0 && !q.includes(recent.label.toLowerCase().split(' ')[0])) ({ from, to } = latestMonthPeriod(month));
  const lastMonth = latestMonthPeriod(Number(HISTORY_THROUGH.slice(5,7)) - 1);
  if (q.includes('last month')) ({ from, to } = lastMonth);
  const dates = q.match(/\d{4}-\d{2}-\d{2}/g); if (dates?.length === 2) [from, to] = dates;
  const periodGiven = month >= 0 || q.includes('last month') || dates?.length === 2;
  // A single-period summary cannot answer a comparison of separate months.
  const multiplePeriods = MONTHS.filter(m => q.includes(m)).length > 1 && !q.includes(recent.label.toLowerCase().split(' ')[0]);
  const historical = !REDUCTION.test(q) && !PERCENT.test(q) && !ADVICE_OR_FUTURE.test(q) && !WEB_TOPIC.test(q);
  const answer = (c: Omit<Calculated,'evidence'> & {evidence?:string[]}): Calculated => ({
    evidence: [], ...c, authoritative:c.authoritative && (c.intent === 'validation' || !multiplePeriods),
  });
  if (from > to || to > HISTORY_THROUGH || from < DATA_START)
    return answer({ intent:'validation', authoritative:true, kind:'help', text:`Choose a period between ${readable(DATA_START)} and ${readable(HISTORY_THROUGH)}. The data ends there.` });

  if (/what.*next|recommend.*lesson|learn next|where.*start/.test(q)) {
    const next = input.actions.find(action => action.type === 'lesson');
    const goal = input.context.goal === 'home' ? 'a first home' : input.context.goal === 'buffer' ? 'building a safety net' : 'understanding your money';
    const lesson = next?.type === 'lesson' ? (next.lessonId === 'balance' ? 'how a balance differs from spending room' : next.lessonId === 'reserve' ? 'how a reserve protects everyday life' : 'how a small change affects a forecast') : null;
    return answer({ intent:'journey', authoritative:/learn next|recommend.*lesson|what should i (learn|do|try) next|where (do|should) i start/.test(q), kind:'journey', text: lesson
      ? `Your direction is ${goal}. Your next discovery is ${lesson}. Try it, then preview a change against this account. Nothing changes in your plan until you choose to apply it.`
      : 'You have completed the foundations. Try a scenario against your current plan, or revisit a lesson whenever you want.' });
  }
  if (/people like me|compared? (with|to) (others|other people|people|average)|comparison|than others|other people|average person|typical|normal|benchmark/.test(q)) {
    const category = isSpendingCategory ? matched! : undefined;
    return answer({ intent:'benchmark', authoritative:/people like me|compared? (with|to)|than others|benchmark/.test(q) && !/mortgage|loan|term|rate|feel/.test(q), kind:'benchmark', category, text: benchmarkAnswer(input.comparison, category, c => euro(c)) });
  }
  if (/basket/.test(q)) {
    const basket: Basket = /irregular/.test(q) ? 'irregular' : /regular|essential/.test(q) ? 'regular' : 'flexible';
    return answer({ intent:'basket', authoritative:historical && /\b(my|regular|irregular|flexible|essential)\b/.test(q), kind:'basket', basket, from:recent.from, to:recent.to,
      text:`Your ${basket} basket averages ${euro(f.baskets[basket],2)} per month over ${recent.label}, using your current classification corrections. These groups help you inspect patterns; they do not decide which spending matters to you.`,
      evidence: rows.filter(t => t.tx_date >= recent.from && isConsumption(t) && basketOf(t, a.corrections, profile) === basket).map(t => t.id) });
  }
  if (/\basp\b/.test(q)) {
    const asp = evaluateAsp(a.aspOpenedOn, a.aspDeposits);
    return answer({ intent:'asp', authoritative:/month|progress|qualif|deposit|count|how (am|far)|my asp/.test(q), kind:'asp',
      text: asp.message + ' The deposit amount and qualifying months are separate milestones; neither guarantees a mortgage.' });
  }
  if (/mortgage|home loan|housing loan|\bloan\b|afford.*\b(home|flat|apartment|house)\b|(declined|rejected).*(mortgage|loan|application)|application.*(declined|rejected)|buy (a |my )?(first )?(home|flat|apartment|house)/.test(q))
    return answer({ intent:'readiness', authoritative:!WEB_TOPIC.test(q) && /\b(my|i|me|am)\b/.test(q) && /ready|afford|declined|rejected|application|gap|short|payment|borrow/.test(q) && !/what is|how does|fixed|variable/.test(q), kind:'readiness', text: readinessAnswer(input.readiness, input.mortgage, c => euro(c)) });
  if (/taxi|uber|rideshare/.test(q)) {
    if (!periodGiven) ({ from, to } = lastMonth);
    const ts = rows.filter(t => t.tx_date >= from && t.tx_date <= to && t.mcc_code === '4121' && t.amountCents < 0);
    return answer({ intent:'taxi', authoritative:(SPEND_QUESTION.test(q) || periodGiven) && historical, kind:'answer', category:'Transportation', from, to, evidence: ts.map(t => t.id),
      text:`Recognised taxi and rideshare spending was ${euro(ts.reduce((s,t) => s - t.amountCents, 0),2)} from ${from} to ${to}. This counts MCC 4121 only; rows without a merchant code cannot establish zero taxi spending.` });
  }
  if (/restaurant|eating|dining|\b(eat|ate) out\b/.test(q)) {
    const category = 'Restaurants';
    const s = summarise(rows, from, to, category, CLOCK, customerId);
    const monthCount = (Number(to.slice(0,4)) - Number(from.slice(0,4))) * 12 + Number(to.slice(5,7)) - Number(from.slice(5,7)) + 1;
    const average = Math.round(s.spentCents / monthCount);
    const spent = `Restaurant spending was ${euro(s.spentCents,2)} from ${from} to ${to}, an average of ${euro(average,2)} per calendar month covered.`;
    const given = q.match(PERCENT)?.[1];
    const percent = Number(given?.replace(',', '.') ?? 20);
    if (percent < 0 || percent > 100) return answer({ intent:'validation', authoritative:true, kind:'help', text:'Choose a spending reduction between 0% and 100%.' });
    if (REDUCTION.test(q) && !/\b(more|increase)\b/.test(q)) {
      // Without a stated percentage, 20% is an example, not the user's scenario.
      return answer({ intent:'restaurant_scenario', authoritative:given !== undefined && !/next month|\bwill\b/.test(q), kind:'scenario', category, from, to, evidence:s.evidence, reductionPercent:percent,
        text:`${spent} ${given ? 'A' : 'For example, a'} ${percent}% reduction would be ${euro(Math.round(average*percent/100),2)} per month. That is a projection, not money already saved.` });
    }
    return answer({ intent:'restaurant_spending', authoritative:(SPEND_QUESTION.test(q) || periodGiven) && historical, kind:'answer', category, from, to, evidence:s.evidence, text:spent });
  }
  if (/balance|safe|save|spend|reserve|buffer|room/.test(q) && !isSpendingCategory)
    return answer({ intent:'forecast', authoritative:/safe to (spend|save)|can i (save|spend)|whole balance|balance available|what('s| is) my balance|my (recorded balance|room|reserve|buffer)/.test(q) && !PERCENT.test(q) && !REDUCTION.test(q), kind:'forecast', evidence:f.evidence,
      text:`Your recorded balance is ${euro(f.balanceCents,2)}. After the projected costs and a protected reserve of ${euro(f.protectedCents)}, estimated extra room to allocate is ${euro(f.remainingCents,2)} over ${f.horizonDays} days. Existing saving transfers are already included. ${f.warnings.join(' ') || 'This is additional room above your estimated everyday spending, not a weekly income.'}` });
  if (matched === 'Invest Deposit') {
    const ds = rows.filter(t => t.tx_date >= from && t.tx_date <= to && t.category === matched && t.amountCents < 0);
    return answer({ intent:'investments', authoritative:historical && (SPEND_QUESTION.test(q) || periodGiven), kind:'answer', category:matched, from, to, evidence:ds.map(t => t.id),
      text:`Investment deposits were ${euro(ds.reduce((s,t) => s - t.amountCents, 0),2)} from ${from} to ${to}, across ${ds.length} transfer${ds.length === 1 ? '' : 's'}. Their destination and current value are not in this data.` });
  }
  const category = isSpendingCategory ? matched! : undefined;
  if (category || matched === 'Salary' || /transactions|categories|overview/.test(q)) {
    const s = summarise(rows, from, to, category, CLOCK, customerId);
    return answer({ intent:'category_spending', authoritative:(SPEND_QUESTION.test(q) || periodGiven || matched === 'Salary') && historical, kind:'answer', category, from, to, evidence:s.evidence,
      text: matched === 'Salary' ? `Recorded salary income was ${euro(s.incomeCents,2)} from ${from} to ${to}. Future salary remains an estimate until received.`
        : `${category || 'Total consumption'} was ${euro(s.spentCents,2)} from ${from} to ${to}. Open the source rows to check the categories or correct a spending basket.` });
  }
  return answer({ intent:'unsupported', authoritative:false, kind:'help',
    text:'This demo coach can calculate spending by category and period, recognised taxis, restaurant scenarios, your cash reserve, ASP progress, home loan readiness and how your spending compares with people like you. Try “What should I learn next?” or “Restaurants last month”.' });
}

/** The block that tells the agent how to use the calculated answer. Empty when nothing applies. */
export function calculatedContext(c: Calculated) {
  if (c.intent === 'unsupported') return '';
  return c.authoritative
    ? `App-calculated answer to this question (authoritative: quote these figures and do not recalculate or refuse them):\n${c.text}`
    : `Possibly relevant app figures (the question may not ask exactly this; use them only if they answer it, and ask a clarifying question if the request is unclear):\n${c.text}`;
}
