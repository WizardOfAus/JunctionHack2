// Revokes a connection: the data is removed here, and a real bank session is closed at the provider.
import { isSameOrigin } from '@/lib/memory/scope';
import { z } from 'zod';
import { personaIdSchema, DEFAULT_PERSONA_ID } from '@/lib/contracts';
import { enableBanking, listConnections, removeConnection, sessionId } from '@/lib/open-banking/server';

export async function POST(request: Request) {
  if(!isSameOrigin(request)) return Response.json({error:'Origin not allowed'},{status:403});
  const parsed = z.object({ personaId: personaIdSchema.optional(), id: z.string().min(1).max(200) }).strict().safeParse(await request.json().catch(() => null));
  const sid = sessionId(request);
  if (!parsed.success || !sid) return Response.json({ error: 'Choose a connection to remove.' }, { status: 400 });
  const personaId=parsed.data.personaId ?? DEFAULT_PERSONA_ID;
  const connection=listConnections(sid,personaId).find(c=>c.id===parsed.data.id);
  if (!connection) return Response.json({revoked:false},{status:404});
  if (connection.provider==='enable-banking' && connection.sessionId) {
    const client=enableBanking();
    if(!client) return Response.json({error:'Provider revocation is unavailable. Try again.'},{status:503});
    try { await client.deleteSession(connection.sessionId); }
    catch { return Response.json({error:'The bank did not confirm revocation. Please retry.'},{status:502}); }
  }
  removeConnection(sid,personaId,connection.id);
  return Response.json({revoked:true});
}
