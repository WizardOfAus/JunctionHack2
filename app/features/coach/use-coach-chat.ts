'use client';
// Chat state for the coach: streams progress from /api/coach/stream and keeps answers scoped to the
// persona, plan and learning context they were asked in. A scope change cancels the request in flight.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CoachAction } from '@/lib/journey/context';
import type { Basket } from '@/lib/finance';
import { applyProgress, emptyProgress, type ProgressState } from '@/lib/coach/progress';
import { streamCoach } from '@/lib/coach/stream-client';

export type CoachMessage = {
  role: 'user' | 'coach'; text: string; kind?: string; mode?: string; intent?: string; category?: string; from?: string; to?: string;
  evidence?: string[]; reductionPercent?: number; basket?: Basket; actions?: CoachAction[]; scope?: string; sources?: string[]; agentUnavailable?: boolean;
};

export function useCoachChat(request: { personaId: string; assumptions: unknown; context: unknown; scopeKey: string }) {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ProgressState>(emptyProgress);
  const [startedAt, setStartedAt] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const latest = useRef(request);
  useEffect(() => { latest.current = request; });

  const cancel = useCallback(() => { controller.current?.abort(); controller.current = null; setBusy(false); setProgress(emptyProgress); }, []);
  useEffect(() => cancel, [request.scopeKey, cancel]);

  const ask = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || controller.current) return;
    const { personaId, assumptions, context, scopeKey } = latest.current;
    const current = new AbortController(); controller.current = current;
    setMessages(m => [...m, { role: 'user', text: question }]);
    setBusy(true); setProgress(emptyProgress); setStartedAt(Date.now());
    let sources: string[] = [];
    const settle = (message: CoachMessage) => { if (!current.signal.aborted && latest.current.scopeKey === scopeKey) setMessages(m => [...m, message]); };
    try {
      const final = await streamCoach({ question, assumptions, personaId, context }, { signal: current.signal, onProgress: event => {
        if (event.type === 'sources') sources = [...new Set([...sources, ...event.domains])];
        setProgress(p => applyProgress(p, event));
      } });
      if (final.status !== 200) throw new Error(String(final.body.error ?? 'failed'));
      settle({ role: 'coach', ...(final.body as Omit<CoachMessage, 'role'>), sources, scope: scopeKey });
    } catch {
      settle({ role: 'coach', text: 'I couldn’t load that answer. Please try your question again.', kind: 'error' });
    } finally {
      if (controller.current === current) { controller.current = null; setBusy(false); setProgress(emptyProgress); }
    }
  }, []);

  const reset = useCallback(() => { cancel(); setMessages([]); }, [cancel]);
  return { messages, busy, progress, startedAt, ask, cancel, reset };
}
