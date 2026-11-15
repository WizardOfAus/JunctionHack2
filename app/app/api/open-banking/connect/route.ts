// Starts a read-only PSD2 connection. The Demo bank connects at once; a real (sandbox) bank returns the
// URL of the bank's own login, which sends the person back to /api/open-banking/callback.
import { z } from 'zod';
import { personaIdSchema, DEFAULT_PERSONA_ID } from '@/lib/contracts';
import { CLOCK } from '@/lib/finance';
import { demoConnection } from '@/lib/open-banking/demo-bank';
import { addPending, enableBanking, ensureSession, publicConnection, saveConnection } from '@/lib/open-banking/server';
import { CONSENT_DAYS } from '@/lib/open-banking/types';

const body = z.object({ personaId: personaIdSchema.optional(), provider: z.enum(['demo', 'enable-banking']), bank: z.string().min(1).max(80).optional() }).strict();

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Choose a bank to connect.' }, { status: 400 });
  const { provider, bank } = parsed.data, personaId = parsed.data.personaId ?? DEFAULT_PERSONA_ID;
  const { sid, cookie } = ensureSession(request);
  const headers: HeadersInit = cookie ? { 'set-cookie': cookie } : {};
  if (provider === 'demo') {
    const connection = demoConnection(personaId, CLOCK, new Date());
    saveConnection(sid, personaId, connection);
    return Response.json({ connected: true, connection: publicConnection(connection) }, { headers });
  }
  const client = enableBanking();
  if (!client || !bank) return Response.json({ error: 'The live bank sandbox is not available on this server.' }, { status: 503 });
  const stateId = crypto.randomUUID();
  addPending(stateId, { sid, personaId, bank, createdAt: Date.now() });
  try {
    const { url } = await client.startAuthorisation({ bank, country: 'FI', state: stateId, redirectUrl: new URL('/api/open-banking/callback', request.url).toString(),
      validUntil: new Date(Date.now() + CONSENT_DAYS * 86400000).toISOString() });
    return Response.json({ redirectUrl: url }, { headers });
  } catch (error) {
    console.error('Enable Banking authorisation failed:', error instanceof Error ? error.message : 'unknown');
    return Response.json({ error: 'That bank could not start the connection. Try again or use the Demo bank.' }, { status: 502 });
  }
}
