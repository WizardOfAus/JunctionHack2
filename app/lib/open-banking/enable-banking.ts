// Enable Banking (https://enablebanking.com/docs/api/reference/): a licensed aggregator for Finnish
// banks' PSD2 APIs, including S-Pankki, OP and Nordea. Account information only; Koti never starts payments.
import { SCOPE, toCents, type AccountType, type Bank, type Connection, type ConnectedAccount, type ConnectedTransaction } from './types';

export const ENABLE_BANKING_API = 'https://api.enablebanking.com';
type Amount = { amount: string; currency: string };
type RawAccount = { uid?: string; account_id?: { iban?: string }; name?: string; product?: string; currency?: string; cash_account_type?: string };
type RawTransaction = { entry_reference?: string; transaction_id?: string; transaction_amount: Amount; credit_debit_indicator?: 'CRDT' | 'DBIT'; booking_date?: string; value_date?: string; transaction_date?: string;
  creditor?: { name?: string }; debtor?: { name?: string }; remittance_information?: string[]; status?: string };

export class EnableBankingError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export function enableBankingClient(opts: { token: () => Promise<string>; fetcher?: typeof fetch; base?: string }) {
  const fetcher = opts.fetcher ?? fetch, base = opts.base ?? ENABLE_BANKING_API;
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetcher(`${base}${path}`, { ...init, headers: { authorization: `Bearer ${await opts.token()}`, 'content-type': 'application/json', accept: 'application/json', ...init.headers }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new EnableBankingError(`Enable Banking returned HTTP ${response.status} for ${path.split('?')[0]}.`, response.status);
    return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
  }
  return {
    async banks(country = 'FI'): Promise<Bank[]> {
      const { aspsps } = await call<{ aspsps: { name: string; country: string; logo?: string; sandbox?: unknown }[] }>(`/aspsps?country=${country}&psu_type=personal`);
      return aspsps.map(a => ({ provider: 'enable-banking', name: a.name, country: a.country, logo: a.logo, sandbox: true }));
    },
    /** Starts the bank's own login (redirect SCA). Returns the URL to send the person to. */
    async startAuthorisation(input: { bank: string; country: string; redirectUrl: string; state: string; validUntil: string }) {
      return call<{ url: string; authorization_id?: string }>('/auth', { method: 'POST', body: JSON.stringify({
        access: { valid_until: input.validUntil }, aspsp: { name: input.bank, country: input.country }, state: input.state, redirect_url: input.redirectUrl, psu_type: 'personal' }) });
    },
    async createSession(code: string) {
      return call<{ session_id: string; accounts: (RawAccount | string)[]; access?: { valid_until?: string } }>('/sessions', { method: 'POST', body: JSON.stringify({ code }) });
    },
    balances: (uid: string) => call<{ balances: { balance_amount: Amount; balance_type?: string; reference_date?: string }[] }>(`/accounts/${encodeURIComponent(uid)}/balances`),
    async transactions(uid: string, dateFrom: string, maxPages = 5) {
      const all: RawTransaction[] = [];
      let key: string | undefined;
      for (let page = 0; page < maxPages; page++) {
        const r = await call<{ transactions: RawTransaction[]; continuation_key?: string }>(`/accounts/${encodeURIComponent(uid)}/transactions?date_from=${dateFrom}${key ? `&continuation_key=${encodeURIComponent(key)}` : ''}`);
        all.push(...r.transactions); key = r.continuation_key; if (!key) break;
      }
      return all;
    },
    deleteSession: (id: string) => call<void>(`/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  };
}

const accountType = (a: RawAccount): AccountType => {
  const t = `${a.cash_account_type ?? ''} ${a.product ?? ''} ${a.name ?? ''}`.toLowerCase();
  return /card|kortti/.test(t) ? 'card' : /svgs|sav|säästö|asp/.test(t) ? 'savings' : /cacc|current|käyttö/.test(t) ? 'current' : 'other';
};
/** Prefer the booked closing balance, then any balance. */
export function pickBalance(balances: { balance_amount: Amount; balance_type?: string; reference_date?: string }[]) {
  const order = ['CLBD', 'ITBD', 'XPCD', 'CLAV', 'ITAV'];
  return [...balances].sort((a, b) => (order.indexOf(a.balance_type ?? '') + 99) % 99 - (order.indexOf(b.balance_type ?? '') + 99) % 99)[0];
}
export function mapAccount(raw: RawAccount | string, balance?: { balance_amount: Amount; reference_date?: string }): ConnectedAccount {
  const a = typeof raw === 'string' ? { uid: raw } : raw;
  const iban = a.account_id?.iban;
  return { id: a.uid ?? iban ?? 'unknown', name: a.name || a.product || (iban ? `Account ${iban.slice(-4)}` : 'Account'), type: accountType(a), iban, currency: a.currency ?? balance?.balance_amount.currency ?? 'EUR',
    balanceCents: balance ? toCents(balance.balance_amount.amount) : null, balanceDate: balance?.reference_date ?? null };
}
export function mapTransaction(accountId: string, t: RawTransaction, i: number): ConnectedTransaction {
  const cents = Math.abs(toCents(t.transaction_amount.amount)) * (t.credit_debit_indicator === 'DBIT' || t.transaction_amount.amount.trim().startsWith('-') ? -1 : 1);
  const counterparty = cents < 0 ? t.creditor?.name : t.debtor?.name;
  return { id: `${accountId}:${t.entry_reference ?? t.transaction_id ?? i}`, accountId, date: t.booking_date ?? t.value_date ?? t.transaction_date ?? '', amountCents: cents,
    description: t.remittance_information?.filter(Boolean).join(' ') || counterparty || 'Transaction', counterparty, status: t.status === 'PDNG' ? 'pending' : 'booked' };
}

/** Exchanges the redirect code and reads accounts, balances and recent transactions into a Connection. */
export async function connectionFromCode(client: ReturnType<typeof enableBankingClient>, input: { code: string; bank: string; dateFrom: string; now: Date; validUntil: string }): Promise<Connection & { sessionId: string }> {
  const session = await client.createSession(input.code);
  const accounts: ConnectedAccount[] = [], transactions: ConnectedTransaction[] = [];
  for (const raw of session.accounts) {
    const uid = typeof raw === 'string' ? raw : raw.uid;
    if (!uid) continue;
    const [b, t] = await Promise.all([client.balances(uid).catch(() => ({ balances: [] })), client.transactions(uid, input.dateFrom).catch(() => [])]);
    accounts.push(mapAccount(raw, pickBalance(b.balances)));
    transactions.push(...t.map((x, i) => mapTransaction(uid, x, i)));
  }
  return { sessionId: session.session_id, id: `eb-${session.session_id}`, provider: 'enable-banking', bankName: input.bank, label: `${input.bank} via Enable Banking (sandbox)`,
    connectedAt: input.now.toISOString(), validUntil: session.access?.valid_until ?? input.validUntil, scope: SCOPE, accounts,
    transactions: transactions.sort((a, b) => b.date.localeCompare(a.date)) };
}
