// This browser's connections for one persona: accounts, balances and recent transactions, with their source label.
import { z } from 'zod';
import { personaIdSchema, DEFAULT_PERSONA_ID } from '@/lib/contracts';
import { listConnections, publicConnection, sessionId } from '@/lib/open-banking/server';

export async function POST(request: Request) {
  const parsed = z.object({ personaId: personaIdSchema.optional() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Unknown demo persona.' }, { status: 400 });
  const sid = sessionId(request);
  return Response.json({ connections: sid ? listConnections(sid, parsed.data.personaId ?? DEFAULT_PERSONA_ID).map(publicConnection) : [] });
}
