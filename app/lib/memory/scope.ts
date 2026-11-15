// Opaque browser ownership, separate from the public demo persona key.
const COOKIE = 'koti_memory';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export type MemoryScope = { visitorId: string; personaId: string };
export function visitorId(request: Request) {
  const value = (request.headers.get('cookie') ?? '').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  return value && UUID.test(value) ? value : null;
}
export function ensureVisitor(request: Request) {
  const existing=visitorId(request);
  if(existing) return {visitorId:existing,cookie:null};
  const id=crypto.randomUUID();
  return {visitorId:id,cookie:`${COOKIE}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${new URL(request.url).protocol==='https:'?'; Secure':''}`};
}
export function isSameOrigin(request: Request) {
  const origin=request.headers.get('origin');
  return (!origin || origin===new URL(request.url).origin) && request.headers.get('sec-fetch-site')!=='cross-site';
}
export const memoryKey = (scope: MemoryScope) => `${scope.visitorId}:${scope.personaId}`;
