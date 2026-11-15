// Live S-Bank product terms via Exa (structured output with citations), cached per day.
// No customer data goes into the query. Falls back to a dated cached copy.
import 'server-only';
import { env } from 'cloudflare:workers';
import cached from '@/data/products/s-pankki-cached.json';
import { liveProducts, type LiveProduct } from './catalogue';

const QUERY = 'S-Pankki säästötili osakesäästötili ASP-tili rahastot korko kulut';
const SCHEMA = { type: 'object', properties: { products: { type: 'array', items: { type: 'object', properties: { product: { type: 'string' }, kind: { type: 'string' }, rate_or_fee: { type: 'string' }, conditions: { type: 'string' }, url: { type: 'string' } } } } } };
export type LiveTerms = { products: LiveProduct[]; checkedAt: string; source: 'live' | 'cached'; note: string };
let memo: { day: string; terms: LiveTerms } | null = null;

export async function sBankTerms(): Promise<LiveTerms> {
  const day = new Date().toISOString().slice(0, 10);
  if (memo?.day === day) return memo.terms;
  const key = (env as unknown as Record<string, string | undefined>).EXA_API_KEY?.trim();
  const fallback: LiveTerms = { products: liveProducts(cached.output), checkedAt: cached.retrievedAt, source: 'cached', note: cached.note };
  if (!key) return fallback;
  try {
    const response = await fetch('https://api.exa.ai/search', { method: 'POST', headers: { 'x-api-key': key, 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ query: QUERY, type: 'auto', numResults: 5, includeDomains: ['s-pankki.fi'], contents: { text: { maxCharacters: 1500 }, maxAgeHours: 72 }, outputSchema: SCHEMA }) });
    if (!response.ok) throw new Error(`Exa returned HTTP ${response.status}`);
    const products = liveProducts(((await response.json()) as { output?: Parameters<typeof liveProducts>[0] }).output ?? {});
    if (!products.length) throw new Error('No cited products');
    memo = { day, terms: { products, checkedAt: day, source: 'live', note: 'Checked live on s-pankki.fi. Terms can change; confirm with the bank.' } };
    return memo.terms;
  } catch (error) {
    console.error('Live product terms failed:', error instanceof Error ? error.message : 'unknown');
    return fallback;
  }
}
