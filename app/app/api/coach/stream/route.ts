// Server-sent events for the coach: allowlisted progress steps, then the same payload as /api/coach.
import { coachResponse } from '@/lib/coach/answer';

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const lifecycle = new AbortController();
  const disconnect = () => lifecycle.abort();
  request.signal.addEventListener('abort', disconnect, { once: true });
  if (request.signal.aborted) disconnect();
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  // The writer observes downstream cancellation, including runtimes that don't
  // propagate it to the incoming Request's signal.
  void writer.closed.catch(disconnect);
  const write = async (text: string) => {
    if (lifecycle.signal.aborted) return;
    try { await writer.write(encoder.encode(text)); } catch { disconnect(); }
  };
  const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  // Detect a departed browser during otherwise quiet tool execution.
  const heartbeat = setInterval(() => { void write(': ping\n\n'); }, 2000);
  void (async () => {
    try {
      const response = await coachResponse(request, { signal: lifecycle.signal, onProgress: event => { void send('progress', event); } });
      await send('final', { status: response.status, body: await response.json() });
    } catch {
      if (!lifecycle.signal.aborted) await send('final', { status: 500, body: { error: 'The coach could not answer. Try again.' } });
    } finally {
      clearInterval(heartbeat);
      request.signal.removeEventListener('abort', disconnect);
      try { await writer.close(); } catch { /* browser already left */ }
    }
  })();
  return new Response(stream.readable, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' } });
}
