// Storage for things a person asked Pesä to remember, keyed by opaque browser ownership and the server-resolved persona.
// Supabase (table pesa_memories) when SUPABASE_SECRET_KEY is set on the server; the publishable key
// cannot write by design. Otherwise an in-memory store that lasts until the server restarts.
import 'server-only';
import { memoryKey, type MemoryScope } from './scope';
import { env } from 'cloudflare:workers';
import { MAX_TOLD, type ToldMemory } from './memory';

export type MemoryStore = { kind: 'supabase' | 'session'; list(scope: MemoryScope): Promise<ToldMemory[]>; add(scope: MemoryScope, text: string): Promise<ToldMemory | null>; remove(scope: MemoryScope, id: string): Promise<void> };
type Row = { id: string; text: string; created_at: string };
const toMemory = (r: Row): ToldMemory => ({ id: r.id, text: r.text, createdAt: r.created_at });

function supabaseStore(url: string, key: string): MemoryStore {
  const headers: Record<string, string> = { apikey: key, 'content-type': 'application/json', accept: 'application/json' };
  if (key.startsWith('eyJ')) headers.authorization = `Bearer ${key}`;
  const call = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${url}/rest/v1/pesa_memories${path}`, { ...init, headers: { ...headers, ...init.headers }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Memory storage returned HTTP ${response.status}.`);
    return response;
  };
  const list = async (scope: MemoryScope) => ((await (await call(`?owner_id=eq.${encodeURIComponent(scope.visitorId)}&persona_id=eq.${encodeURIComponent(scope.personaId)}&select=id,text,created_at&order=created_at.asc&limit=${MAX_TOLD}`)).json()) as Row[]).map(toMemory);
  return {
    kind: 'supabase', list,
    async add(scope, text) {
      if ((await list(scope)).length >= MAX_TOLD) return null;
      const [row] = await (await call('', { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify({ owner_id: scope.visitorId, persona_id: scope.personaId, text }) })).json() as Row[];
      return toMemory(row);
    },
    async remove(scope, id) { await call(`?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(scope.visitorId)}&persona_id=eq.${encodeURIComponent(scope.personaId)}`, { method: 'DELETE' }); },
  };
}

const sessions: Map<string, ToldMemory[]> = ((globalThis as { __pesaMemory?: Map<string, ToldMemory[]> }).__pesaMemory ??= new Map());
const sessionStore: MemoryStore = {
  kind: 'session',
  async list(scope) { return sessions.get(memoryKey(scope)) ?? []; },
  async add(scope, text) {
    const items = sessions.get(memoryKey(scope)) ?? [];
    if (items.length >= MAX_TOLD) return null;
    const memory = { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() };
    sessions.set(memoryKey(scope), [...items, memory]);
    return memory;
  },
  async remove(scope, id) { sessions.set(memoryKey(scope), (sessions.get(memoryKey(scope)) ?? []).filter(m => m.id !== id)); },
};

export function memoryStore(): MemoryStore {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = env as unknown as Record<string, string | undefined>;
  const url = SUPABASE_URL?.trim().replace(/\/+$/, ''), key = SUPABASE_SECRET_KEY?.trim();
  return url?.startsWith('https://') && key ? supabaseStore(url, key) : sessionStore;
}
