'use client';
// "What Pesä knows": facts learned from the account (read-only, with sources) and things the person
// told Pesä (removable). Nothing is remembered without the person adding or confirming it.
import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { LearnedFact, ToldMemory } from '@/lib/memory/memory';
import { PesaEgg } from '@/features/pesa/pesa-egg';
import styles from './memory-panel.module.css';

const EVENT = 'pesa-memory';
const post = (body: unknown) => fetch('/api/memory', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** Saves something the person confirmed. Other open memory panels refresh. */
export async function saveMemory(personaId: string, text: string) {
  const response = await post({ action: 'add', personaId, text });
  if (response.ok) window.dispatchEvent(new Event(EVENT));
  return response.ok;
}

type State = { learned: LearnedFact[]; told: ToldMemory[]; storage: string } | null;

export function MemoryPanel({ personaId, assumptions, goal }: { personaId: string; assumptions: unknown; goal: string }) {
  const [state, setState] = useState<State>(null);
  const [draft, setDraft] = useState('');
  const [failed, setFailed] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await post({ action: 'list', personaId, assumptions, goal });
      const data = await response.json() as State;
      if (!signal?.aborted) { if (response.ok) { setState(data); setFailed(false); } else setFailed(true); }
    } catch { if (!signal?.aborted) setFailed(true); }
  }, [personaId, assumptions, goal]);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => void load(controller.signal);
    refresh(); window.addEventListener(EVENT, refresh);
    return () => { controller.abort(); window.removeEventListener(EVENT, refresh); };
  }, [load]);
  const remove = async (id: string) => { setState(s => s && { ...s, told: s.told.filter(m => m.id !== id) }); await post({ action: 'delete', personaId, id }); void load(); };
  const add = async () => { if (draft.trim() && await saveMemory(personaId, draft)) setDraft(''); };

  return (
    <details className={styles.panel}>
      <summary><PesaEgg size={20} /><span>What Pesä knows about you</span>{state ? <small>{state.learned.length + state.told.length}</small> : null}</summary>
      {failed ? <p className={styles.note}>Pesä’s memory is not available right now.</p> : !state ? <p className={styles.note}>Loading…</p> : <div className={styles.body}>
        <h3>Learned from your account</h3>
        <ul className={styles.chips}>{state.learned.map(f => <li key={f.id} title={f.source}>{f.text}<small>{f.source}</small></li>)}</ul>
        <h3>You told Pesä</h3>
        {state.told.length ? <ul className={styles.chips}>{state.told.map(m => <li key={m.id} className={styles.told}>{m.text}<button onClick={() => void remove(m.id)} aria-label={`Forget: ${m.text}`}><X size={13} /></button></li>)}</ul>
          : <p className={styles.note}>Nothing yet. Try “Remember that I want to buy a flat in Espoo in 2028”.</p>}
        <form className={styles.add} onSubmit={e => { e.preventDefault(); void add(); }}>
          <label className="sr-only" htmlFor="pesa-memory-add">Tell Pesä something to remember</label>
          <input id="pesa-memory-add" value={draft} maxLength={200} placeholder="Tell Pesä something to remember…" onChange={e => setDraft(e.target.value)} />
          <button type="submit" disabled={!draft.trim()} aria-label="Remember this"><Plus size={16} /></button>
        </form>
        <p className={styles.note}>{state.storage === 'session' ? 'Saved for this browser and demo persona until the server restarts.' : 'Saved for this browser and demo persona. Clearing browser cookies removes access.'} You can remove anything at any time.</p>
      </div>}
    </details>
  );
}
