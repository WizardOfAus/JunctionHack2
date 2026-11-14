// Reads the demo persona and its transactions from the Supabase copy of app/data
// (see supabase/README.md). Server only: the server chooses the customer, and a secret key
// must never reach the browser.
// This module has no runtime imports, so tests can run it with a stub fetch.
import type { Transaction } from './finance';

export type SupabaseConfig = { url: string; apiKey: string };
/** A persona.json transaction: the finance fields plus the original source text. */
export type SourceTransaction = Transaction & { tx_amount_eur: string; balance_after_eur: string };
export type PersonaRecord = {
  customerId: string; accountId: string; asOf: string; sourceRevision: string;
  statistics: unknown; transactions: SourceTransaction[];
};

/** Supabase returns at most this many rows per request by default. */
export const PAGE_SIZE = 1000;
const TIMEOUT_MS = 10_000;

export class DemoDataUnavailableError extends Error {}

type PersonaRow = { customer_id: string; account_id: string; as_of: string; source_revision: string; statistics: unknown };
export type TransactionRow = {
  id: string; source_row: number; customer_id: string; bank_account_id: string; tx_date: string; tx_timestamp: string;
  category: string; tx_amount_eur: string; balance_after_eur: string; transaction_type: string;
  merchant_id: string | null; mcc_code: string | null; amount_cents: number | string; balance_cents: number | string;
};
const TX_COLUMNS = 'id,source_row,customer_id,bank_account_id,tx_date,tx_timestamp,category,tx_amount_eur,balance_after_eur,transaction_type,merchant_id,mcc_code,amount_cents,balance_cents';

function cents(value: number | string, id: string) {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new DemoDataUnavailableError(`Transaction ${id} has a cent value that is not an integer.`);
  return n;
}

/** Converts one database row back to the shape of a persona.json transaction. */
export function toTransaction(row: TransactionRow): SourceTransaction {
  return {
    customer_id: row.customer_id, bank_account_id: row.bank_account_id, tx_date: row.tx_date, tx_timestamp: row.tx_timestamp,
    category: row.category, tx_amount_eur: row.tx_amount_eur, balance_after_eur: row.balance_after_eur,
    transaction_type: row.transaction_type, merchant_id: row.merchant_id ?? '', mcc_code: row.mcc_code ?? '',
    id: row.id, sourceRow: row.source_row, amountCents: cents(row.amount_cents, row.id), balanceCents: cents(row.balance_cents, row.id),
  };
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** Uses SUPABASE_SECRET_KEY when set, else SUPABASE_PUBLISHABLE_KEY (the demo tables allow public reads). */
export function readConfig(env: Record<string, unknown>): SupabaseConfig {
  const url = text(env.SUPABASE_URL).replace(/\/+$/, '');
  const apiKey = text(env.SUPABASE_SECRET_KEY) || text(env.SUPABASE_PUBLISHABLE_KEY);
  if (!url || !apiKey) throw new DemoDataUnavailableError('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or SUPABASE_SECRET_KEY) on the server (app/.dev.vars for local development). See supabase/README.md.');
  return { url, apiKey };
}

async function get<T>(config: SupabaseConfig, path: string, fetcher: typeof fetch): Promise<T[]> {
  // sb_publishable_… and sb_secret_… keys go in the apikey header only. Legacy JWT keys also need a Bearer header.
  const headers: Record<string, string> = { apikey: config.apiKey, Accept: 'application/json' };
  if (config.apiKey.startsWith('eyJ')) headers.Authorization = `Bearer ${config.apiKey}`;
  let response: Response;
  try {
    response = await fetcher(`${config.url}/rest/v1/${path}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    throw new DemoDataUnavailableError(`Supabase did not respond: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new DemoDataUnavailableError(`Supabase returned HTTP ${response.status} for ${path.split('?')[0]}.`);
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new DemoDataUnavailableError(`Supabase returned an unexpected body for ${path.split('?')[0]}.`);
  return body as T[];
}

/** Loads one server-chosen persona. The caller sets customerId; the browser never does. */
export async function fetchPersona(config: SupabaseConfig, customerId: string, fetcher: typeof fetch = fetch): Promise<PersonaRecord> {
  if (!/^CUST\d{5}$/.test(customerId)) throw new DemoDataUnavailableError('The demo customer ID is not valid.');
  const id = encodeURIComponent(customerId);
  const [persona] = await get<PersonaRow>(config, `personas?customer_id=eq.${id}&select=customer_id,account_id,as_of,source_revision,statistics`, fetcher);
  if (!persona) throw new DemoDataUnavailableError(`Persona ${customerId} is not in Supabase. Load the seed (see supabase/README.md).`);
  const rows: TransactionRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await get<TransactionRow>(config, `transactions?customer_id=eq.${id}&select=${TX_COLUMNS}&order=tx_date.asc,source_row.asc&limit=${PAGE_SIZE}&offset=${offset}`, fetcher);
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  if (!rows.length) throw new DemoDataUnavailableError(`Persona ${customerId} has no transactions in Supabase.`);
  const transactions = rows.map(toTransaction);
  if (transactions.some((t) => t.customer_id !== customerId)) throw new DemoDataUnavailableError('Supabase returned rows for a different customer.');
  return {
    customerId: persona.customer_id, accountId: persona.account_id, asOf: persona.as_of,
    sourceRevision: persona.source_revision, statistics: persona.statistics, transactions,
  };
}
