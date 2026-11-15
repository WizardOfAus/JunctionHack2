// The bank sends the person back here after they approve (or cancel) the connection.
import { addDays } from '@/lib/finance';
import { connectionFromCode } from '@/lib/open-banking/enable-banking';
import { enableBanking, saveConnection, sessionId, takePending } from '@/lib/open-banking/server';
import { CONSENT_DAYS } from '@/lib/open-banking/types';

export async function GET(request: Request) {
  const url = new URL(request.url), back = (status: string) => Response.redirect(new URL(`/accounts?bank=${status}`, url).toString(), 303);
  const pending = takePending(url.searchParams.get('state') ?? '');
  const code = url.searchParams.get('code'), client = enableBanking();
  // The state must match a connection this browser started, so a forged callback cannot attach data.
  if (!pending || pending.sid !== sessionId(request) || !client) return back('error');
  if (!code) return back('cancelled');
  try {
    const now = new Date();
    const connection = await connectionFromCode(client, { code, bank: pending.bank, now, dateFrom: addDays(now.toISOString().slice(0, 10), -180), validUntil: new Date(now.getTime() + CONSENT_DAYS * 86400000).toISOString() });
    saveConnection(pending.sid, pending.personaId, connection);
    return back('connected');
  } catch (error) {
    console.error('Enable Banking session failed:', error instanceof Error ? error.message : 'unknown');
    return back('error');
  }
}
