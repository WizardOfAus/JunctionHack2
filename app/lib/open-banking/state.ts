import type { Connection } from './types';

type Stored = Connection & { sessionId?: string };
type Pending = { sid: string; personaId: string; bank: string; createdAt: number };
const state = ((globalThis as { __kotiOpenBanking?: { connections: Map<string, Map<string, Stored>>; pending: Map<string, Pending> } }).__kotiOpenBanking ??= { connections: new Map(), pending: new Map() });

const COOKIE = 'koti_ob';
export function sessionId(request: Request) {
  return /(?:^|;\s*)koti_ob=([0-9a-f-]{36})/.exec(request.headers.get('cookie') ?? '')?.[1] ?? null;
}
/** Returns the session id and, for a new session, the Set-Cookie header value. */
export function ensureSession(request: Request) {
  const existing = sessionId(request);
  if (existing) return { sid: existing, cookie: null };
  const sid = crypto.randomUUID();
  return { sid, cookie: `${COOKIE}=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}` };
}

const key = (sid: string, personaId: string) => `${sid}:${personaId}`;
export const publicConnection = ({ sessionId: _secret, ...connection }: Stored): Connection => (void _secret, connection);
export function listConnections(sid: string, personaId: string) {
  const map=state.connections.get(key(sid,personaId));
  if(!map) return [];
  for(const [id,c] of map) if(Date.parse(c.validUntil)<=Date.now()) map.delete(id);
  return [...map.values()];
}
export function saveConnection(sid: string, personaId: string, connection: Stored) {
  const k = key(sid, personaId), map = state.connections.get(k) ?? new Map<string, Stored>();
  map.set(connection.id, connection); state.connections.set(k, map);
}
export function removeConnection(sid: string, personaId: string, id: string) {
  const stored = state.connections.get(key(sid, personaId))?.get(id);
  state.connections.get(key(sid, personaId))?.delete(id);
  return stored ?? null;
}
export function addPending(stateId: string, pending: Pending) {
  const cutoff = Date.now() - 15 * 60000;
  for (const [k, p] of state.pending) if (p.createdAt < cutoff) state.pending.delete(k);
  state.pending.set(stateId, pending);
}
export function takePending(stateId: string, sid: string | null) { const p = state.pending.get(stateId); if(!p || p.sid!==sid) return null; state.pending.delete(stateId); return p.createdAt > Date.now() - 15 * 60000 ? p : null; }

