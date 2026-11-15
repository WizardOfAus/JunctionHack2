// Daily cache for S-Bank product terms from Exa. It has no server imports, so tests can give it a fake fetch.
// No customer data goes into the query. A failure gives the dated cached copy and is also cached for that day.
import { liveProducts, type LiveProduct } from './catalogue';

const QUERY = 'S-Pankki säästötili osakesäästötili ASP-tili rahastot korko kulut';
const SCHEMA = { type: 'object', properties: { products: { type: 'array', items: { type: 'object', properties: { product: { type: 'string' }, kind: { type: 'string' }, rate_or_fee: { type: 'string' }, conditions: { type: 'string' }, url: { type: 'string' } } } } } };
export const EXA_TIMEOUT_MS = 8000;
export type LiveTerms = { products: LiveProduct[]; checkedAt: string; source: 'live' | 'cached'; note: string };
type Deps = { key: () => string | undefined; fallback: () => LiveTerms; fetch?: typeof fetch; today?: () => string };

export function createSBankTerms(deps: Deps): () => Promise<LiveTerms> {
  let memo: { day: string; terms: LiveTerms } | null = null;
  // One Exa call at a time: requests that arrive together share it.
  let pending: Promise<LiveTerms> | null = null;
  const today = deps.today ?? (() => new Date().toISOString().slice(0, 10));
  const doFetch = deps.fetch ?? ((input, init) => fetch(input, init));

  async function load(day: string, key: string): Promise<LiveTerms> {
    const fallback = deps.fallback();
    try {
      const response = await doFetch('https://api.exa.ai/search', { method: 'POST', headers: { 'x-api-key': key, 'content-type': 'application/json' }, signal: AbortSignal.timeout(EXA_TIMEOUT_MS),
        body: JSON.stringify({ query: QUERY, type: 'auto', numResults: 5, includeDomains: ['s-pankki.fi'], contents: { text: { maxCharacters: 1500 }, maxAgeHours: 72 }, outputSchema: SCHEMA }) });
      if (!response.ok) throw new Error(`Exa returned HTTP ${response.status}`);
      const products = liveProducts(((await response.json()) as { output?: Parameters<typeof liveProducts>[0] }).output ?? {});
      if (!products.length) {
        console.error('Live product terms failed: No cited products');
        memo = { day, terms: fallback };
        return fallback;
      }
      memo = { day, terms: { products, checkedAt: day, source: 'live', note: 'Checked live on s-pankki.fi. Terms can change; confirm with the bank.' } };
      return memo.terms;
    } catch (error) {
      console.error('Live product terms failed:', error instanceof Error ? error.message : 'unknown');
      memo = { day, terms: fallback };
      return fallback;
    }
  }

  return async function sBankTerms() {
    const day = today();
    if (memo?.day === day) return memo.terms;
    const key = deps.key()?.trim();
    if (!key) return deps.fallback();
    if (pending) return pending;
    pending = load(day, key).finally(() => { pending = null; });
    return pending;
  };
}
