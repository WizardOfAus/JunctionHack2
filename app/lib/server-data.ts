import 'server-only';
import { env } from 'cloudflare:workers';
import { historyOnly } from './finance';
import { DemoDataUnavailableError, fetchPersona, readConfig } from './supabase-data';

export { DemoDataUnavailableError };

/** The server sets the customer scope. The browser never chooses it. */
export const DEMO_CUSTOMER_ID = 'CUST04859';
export const SOURCE_URL = 'https://github.com/hackjunction/Junction-2026-S-pankki';

async function load() {
  const persona = await fetchPersona(readConfig(env as unknown as Record<string, unknown>), DEMO_CUSTOMER_ID);
  return {
    transactions: historyOnly(persona.transactions),
    provenance: { customerId: persona.customerId, accountId: persona.accountId, sourceRevision: persona.sourceRevision, asOf: persona.asOf, source: SOURCE_URL, statistics: persona.statistics },
  };
}

let cached: ReturnType<typeof load> | undefined;

/**
 * Loads the demo persona from Supabase (see supabase/README.md) once per server process.
 * A failed load is not kept, so the next request tries again.
 */
export function demoData() {
  cached ??= load().catch((error) => { cached = undefined; throw error; });
  return cached;
}

/** The response for a route when demoData() fails. Details go to the server log only. */
export function demoDataUnavailable(error: unknown) {
  console.error('Demo data unavailable:', error instanceof Error ? error.message : error);
  return Response.json({ error: 'The demo data is not available at the moment. Try again later.' }, { status: 503 });
}
