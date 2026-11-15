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
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const parsed = parseEvents(buffer + value);
    buffer = parsed.rest;
    for (const { event, data } of parsed.events) {
      if (event === 'progress') options.onProgress?.(data as CoachProgress);
      if (event === 'final') return data as CoachFinal;
    }
  }
  throw new Error('The coach stream ended without an answer.');
}
