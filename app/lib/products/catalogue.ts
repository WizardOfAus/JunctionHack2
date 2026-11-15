// Savings and investment options in Finland (the closest equivalents to a UK ISA), explained neutrally.
// Information, not investment advice. Facts are general; product terms come live from the provider.

export type ProductId = 'savings' | 'asp' | 'funds' | 'share-savings' | 'ps';
export type ProductInfo = { id: ProductId; name: string; finnish: string; what: string; tax: string; limits: string; access: string; risk: 'none' | 'low' | 'medium' | 'high'; source: string; sourceUrl: string };

export const products: Record<ProductId, ProductInfo> = {
  savings: { id: 'savings', name: 'Savings account', finnish: 'Säästötili', what: 'An interest-paying account for money you may need soon, such as a safety buffer.',
    tax: 'Interest is capital income; the bank withholds the tax.', limits: 'Deposits are covered by the deposit guarantee up to €100,000 per person per bank.', access: 'Usually available at any time.', risk: 'none',
    source: 'Financial Stability Authority (deposit guarantee)', sourceUrl: 'https://rahoitusvakausvirasto.fi/en/' },
  asp: { id: 'asp', name: 'ASP first-home saving', finnish: 'ASP-tili', what: 'A state-supported account for saving towards your first home. When you buy, you can get an ASP loan with a state guarantee and interest support.',
    tax: 'Interest is tax-free when the savings are used for a first home on ASP terms.', limits: 'Rules on monthly deposits, saving time and loan limits apply; they were renewed on 1 June 2026.', access: 'Meant to be kept until you buy.', risk: 'none',
    source: 'State Treasury (Valtiokonttori)', sourceUrl: 'https://www.valtiokonttori.fi/' },
  funds: { id: 'funds', name: 'Investment funds', finnish: 'Rahastot', what: 'A fund pools many people’s money into many shares or bonds, so one purchase spreads the risk.',
    tax: 'Gains are taxed as capital income when you sell.', limits: 'No deposit cap; fund fees reduce returns.', access: 'Can usually be sold within days.', risk: 'medium',
    source: 'Finnish Financial Supervisory Authority', sourceUrl: 'https://www.finanssivalvonta.fi/en/' },
  'share-savings': { id: 'share-savings', name: 'Share savings account', finnish: 'Osakesäästötili', what: 'An account for buying and selling listed shares without paying tax until you withdraw money.',
    tax: 'Gains and dividends inside the account are taxed only when you withdraw.', limits: 'Deposits are capped at €100,000; each person can have one.', access: 'You can withdraw, but the gain part of a withdrawal is taxed.', risk: 'high',
    source: 'Finnish Tax Administration', sourceUrl: 'https://www.vero.fi/en/individuals/property/investments/' },
  ps: { id: 'ps', name: 'Voluntary pension saving', finnish: 'PS-sopimus', what: 'Long-term saving for retirement, locked until retirement age.',
    tax: 'The tax deduction for new payments ends on 1 January 2027; savings made before then keep their treatment.', limits: 'Withdrawals start at retirement age.', access: 'Locked until retirement.', risk: 'medium',
    source: 'Finnish Tax Administration', sourceUrl: 'https://www.vero.fi/en/individuals/' },
};

export type Suggestion = { id: ProductId; reason: string };
/** A neutral order of options for this person's situation, each with the reason. Not a recommendation of a product. */
export function suggest(input: { goal: 'home' | 'buffer' | 'understand'; bufferMonths: number | null }): Suggestion[] {
  const out: Suggestion[] = [];
  const thinBuffer = input.bufferMonths !== null && input.bufferMonths < 3;
  if (thinBuffer) out.push({ id: 'savings', reason: `Your reserve covers about ${input.bufferMonths} months of essentials. A safety buffer in an easy-access account usually comes first.` });
  if (input.goal === 'home') out.push({ id: 'asp', reason: 'You are working towards a first home, which is what ASP is designed for.' });
  if (!thinBuffer) out.push({ id: 'savings', reason: 'Easy access keeps your buffer ready for surprises.' });
  if (input.goal !== 'home') out.push({ id: 'asp', reason: 'Worth knowing if a first home is ever a goal: saving time counts.' });
  out.push({ id: 'funds', reason: 'For money you will not need for several years. Values go up and down.' });
  out.push({ id: 'share-savings', reason: 'For investing in individual listed shares over the long term, with tax deferred.' });
  out.push({ id: 'ps', reason: 'Locked until retirement, and the deduction for new payments ends in 2027.' });
  return out;
}

/** Maps a provider's product to an option above, by its kind or name. */
export function productKind(text: string): ProductId | null {
  const t = text.toLowerCase();
  return /asp/.test(t) ? 'asp' : /osakesäästö|share saving/.test(t) ? 'share-savings' : /rahasto|fund/.test(t) ? 'funds' : /\bps\b|pension|eläke/.test(t) ? 'ps' : /säästö|tuotto|saving|talletus/.test(t) ? 'savings' : null;
}

export type LiveProduct = { kind: ProductId | null; product: string; rateOrFee: string; conditions: string; url: string; citations: string[] };
type ExaOutput = { content?: { products?: { product?: string; kind?: string; rate_or_fee?: string; conditions?: string; url?: string }[] }; grounding?: { field: string; citations?: { url: string }[] }[] };
/** Keeps only products whose page is on the allowed domain and whose fields have citations from it. */
export function liveProducts(output: ExaOutput, domain = 's-pankki.fi'): LiveProduct[] {
  const onDomain = (url = '') => { try { const h = new URL(url).hostname; return h === domain || h.endsWith(`.${domain}`); } catch { return false; } };
  return (output.content?.products ?? []).flatMap((p, i) => {
    const citations = [...new Set((output.grounding ?? []).filter(g => g.field.startsWith(`products[${i}]`)).flatMap(g => g.citations ?? []).map(c => c.url).filter(onDomain))];
    if (!p.product || !onDomain(p.url) || !citations.length) return [];
    return [{ kind: productKind(`${p.kind ?? ''} ${p.product}`), product: p.product, rateOrFee: p.rate_or_fee ?? '', conditions: p.conditions ?? '', url: p.url!, citations }];
  });
}
