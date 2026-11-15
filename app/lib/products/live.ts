// Live S-Bank product terms via Exa (structured output with citations), cached per day.
// No customer data goes into the query. Falls back to a dated cached copy.
import 'server-only';
import { env } from 'cloudflare:workers';
import cached from '@/data/products/s-pankki-cached.json';
import { liveProducts } from './catalogue';
import { createSBankTerms, type LiveTerms } from './terms';

export type { LiveTerms };
export const sBankTerms = createSBankTerms({
  key: () => (env as unknown as Record<string, string | undefined>).EXA_API_KEY,
  fallback: () => ({ products: liveProducts(cached.output), checkedAt: cached.retrievedAt, source: 'cached', note: cached.note }),
});
