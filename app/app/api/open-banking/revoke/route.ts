// Revokes a connection: the data is removed here, and a real bank session is closed at the provider.
import { z } from 'zod';
import { personaIdSchema, DEFAULT_PERSONA_ID } from '@/lib/contracts';
import { enableBanking, removeConnection, sessionId } from '@/lib/open-banking/server';

export async function POST(request: Request) {
  const parsed = z.object({ personaId: personaIdSchema.optional(), id: z.string().min(1).max(200) }).strict().safeParse(await request.json().catch(() => null));
  const sid = sessionId(request);
  if (!parsed.success || !sid) return Response.json({ error: 'Choose a connection to remove.' }, { status: 400 });
  const removed = removeConnection(sid, parsed.data.personaId ?? DEFAULT_PERSONA_ID, parsed.data.id);
  if (removed?.provider === 'enable-banking' && removed.sessionId) await enableBanking()?.deleteSession(removed.sessionId).catch(() => undefined);
  return Response.json({ revoked: Boolean(removed) });
}
