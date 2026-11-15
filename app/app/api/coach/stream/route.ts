// Server-sent events for the coach: allowlisted progress steps, then the same payload as /api/coach.
import { coachResponse } from '@/lib/coach/answer';

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { /* the browser left */ }
      };
      try {
        // request.signal ends the agent read when the browser disconnects or cancels.
        const response = await coachResponse(request, { signal: request.signal, onProgress: event => send('progress', event) });
        send('final', { status: response.status, body: await response.json() });
      } catch {
        if (!request.signal.aborted) send('final', { status: 500, body: { error: 'The coach could not answer. Try again.' } });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' } });
}
