'use client';
// Chat state for the coach: streams progress from /api/coach/stream and keeps answers scoped to the
// persona, plan and learning context they were asked in. A scope change cancels the request in flight.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CoachAction } from '@/lib/journey/context';
import type { Basket } from '@/lib/finance';
import type { AnswerVisual } from '@/lib/coach/visuals';
import { applyProgress, emptyProgress, type ProgressState } from '@/lib/coach/progress';
import { streamCoach } from '@/lib/coach/stream-client';

export type CoachMessage = {
  role: 'user' | 'coach'; text: string; source?: {dataset?: string; customerLabel?: string}; kind?: string; mode?: string; intent?: string; category?: string; from?: string; to?: string;
  evidence?: string[]; reductionPercent?: number; basket?: Basket; actions?: CoachAction[]; scope?: string; sources?: string[]; agentUnavailable?: boolean; rememberSuggestion?: string; visual?: AnswerVisual | null;
};

export function useCoachChat(request: { personaId: string; assumptions: unknown; context: unknown; scopeKey: string }) {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ProgressState>(emptyProgress);
  const [startedAt, setStartedAt] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const messagesRef = useRef<CoachMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; });
  const latest = useRef(request);
  useEffect(() => { latest.current = request; });

  const cancel = useCallback(() => { controller.current?.abort(); controller.current = null; setBusy(false); setProgress(emptyProgress); }, []);
  useEffect(() => cancel, [request.scopeKey, cancel]);

  const ask = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || controller.current) return;
    const { personaId, assumptions, context, scopeKey } = latest.current;
    // The last few turns, so follow-ups work. Errors and confirmation prompts are left out.
    const history = messagesRef.current.filter(m => m.kind !== 'error' && m.kind !== 'remember').slice(-6).map(m => ({ role: m.role, text: m.text.slice(0, 4000) }));
    const current = new AbortController(); controller.current = current;
    setMessages(m => [...m, { role: 'user', text: question }]);
    setBusy(true); setProgress(emptyProgress); setStartedAt(Date.now());
    let sources: string[] = [];
    const settle = (message: CoachMessage) => { if (!current.signal.aborted && latest.current.scopeKey === scopeKey) setMessages(m => [...m, message]); };
    try {
      const final = await streamCoach({ question, assumptions, personaId, context, history }, { signal: current.signal, onProgress: event => {
        if (current.signal.aborted || latest.current.scopeKey !== scopeKey) return;
        if (event.type === 'sources') sources = [...new Set([...sources, ...event.domains])];
        setProgress(p => applyProgress(p, event));
      } });
      if (final.status !== 200) throw new Error(String(final.body.error ?? 'failed'));
      settle({ role: 'coach', ...(final.body as Omit<CoachMessage, 'role'>), sources: final.body.mode === 'agent' ? sources : [], scope: scopeKey });
    } catch {
      settle({ role: 'coach', text: 'I couldn’t load that answer. Please try your question again.', kind: 'error' });
    } finally {
      if (controller.current === current) { controller.current = null; setBusy(false); setProgress(emptyProgress); }
    }
  }, []);

  const reset = useCallback(() => { cancel(); setMessages([]); }, [cancel]);
  /** Asks the last question again after an error, without duplicating it in the thread. */
  const retry = useCallback(() => {
    const list = messagesRef.current, at = list.map(m => m.role).lastIndexOf('user');
    if (at < 0 || controller.current) return;
    const text = list[at].text;
    messagesRef.current = list.slice(0, at);
    setMessages(list.slice(0, at));
    void ask(text);
  }, [ask]);
  return { messages, busy, progress, startedAt, ask, cancel, reset, retry };
}
