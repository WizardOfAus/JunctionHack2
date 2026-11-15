// Browser side of /api/coach/stream: reads server-sent events and reports progress, then the final payload.
import type { CoachProgress } from './progress';

export type CoachFinal = { status: number; body: Record<string, unknown> };

/** Splits a server-sent event buffer into complete events and the unfinished rest. */
export function parseEvents(buffer: string) {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  const events = parts.flatMap(part => {
    const event = part.match(/^event: (.+)$/m)?.[1];
    const data = part.match(/^data: (.+)$/m)?.[1];
    return event && data ? [{ event, data: JSON.parse(data) as unknown }] : [];
  });
  return { events, rest };
}

export async function streamCoach(body: unknown, options: { signal?: AbortSignal; onProgress?: (event: CoachProgress) => void }): Promise<CoachFinal> {
  const response = await fetch('/api/coach/stream', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: options.signal });
  if (!response.body) throw new Error('The coach stream is not available.');
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '', capability: string | undefined, cancelled = false, complete = false;
  const stop = () => {
    if (!capability || cancelled || complete) return;
    cancelled = true;
    // An unguessable capability only stops this run. Never store it or put it in a URL.
    void fetch('/api/coach/cancel', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({capability}), keepalive:true}).catch(()=>{});
  };
  options.signal?.addEventListener('abort', stop, {once:true});
  if (typeof window !== 'undefined') window.addEventListener('pagehide', stop);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const parsed = parseEvents(buffer + value);
      buffer = parsed.rest;
      for (const { event, data } of parsed.events) {
        if (event === 'admitted' && data && typeof data === 'object' && 'capability' in data && typeof data.capability === 'string') {
          capability = data.capability;
          if (options.signal?.aborted) stop();
        }
        if (event === 'progress') options.onProgress?.(data as CoachProgress);
        if (event === 'final') { complete = true; return data as CoachFinal; }
      }
    }
    throw new Error('The coach stream ended without an answer.');
  } finally {
    if (!complete) stop();
    options.signal?.removeEventListener('abort', stop);
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', stop);
    await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
}
