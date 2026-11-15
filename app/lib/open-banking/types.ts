// Connected accounts from other banks (PSD2 account information), in one shape for every provider.
// Data from a connection is observed data from that provider; the Demo bank is always labelled simulated.

export type Provider = 'demo' | 'enable-banking';
export type Bank = { provider: Provider; name: string; country: string; logo?: string; sandbox: boolean };
export type AccountType = 'current' | 'savings' | 'card' | 'other';
export type ConnectedAccount = { id: string; name: string; type: AccountType; iban?: string; currency: string; balanceCents: number | null; balanceDate: string | null };
export type ConnectedTransaction = { id: string; accountId: string; date: string; amountCents: number; currency?: string; description: string; counterparty?: string; status: 'booked' | 'pending' };
export type Connection = {
  id: string; provider: Provider; bankName: string;
  /** Shown on every figure from this connection. */
  label: string;
  connectedAt: string; validUntil: string;
  /** Read-only account information. Payments are never part of a Koti consent. */
  scope: ('accounts' | 'balances' | 'transactions')[];
  accounts: ConnectedAccount[]; transactions: ConnectedTransaction[];
};

/** Default consent length. Banks ask the person to authenticate again at least every 180 days (PSD2 SCA). */
export const CONSENT_DAYS = 90;
export const SCOPE: Connection['scope'] = ['accounts', 'balances', 'transactions'];

/** "12.34" or "-0.5" → integer cents, without floating-point drift. */
export function toCents(amount: string | number) {
  const text = typeof amount === 'number' ? amount.toFixed(2) : amount.trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error(`Invalid amount: ${text}`);
  const cents = (match[1] ? -1 : 1) * (Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0')));
  if (!Number.isSafeInteger(cents)) throw new Error('Amount is outside the supported range');
  return cents;
}
