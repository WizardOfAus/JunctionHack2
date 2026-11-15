// Progress shown while the coach works. Only allowlisted step labels and the domains of public
// sources leave the server: never tool inputs, reasoning, customer data or credentials.

export type CoachProgress =
  | { type: 'step'; id: string; label: string }
  | { type: 'step-done'; id: string }
  | { type: 'sources'; id: string; domains: string[] }
  | { type: 'text'; delta: string };

/** Friendly labels for the agent's tools. Unknown tools get a neutral label. */
const TOOL_LABELS: Record<string, string> = {
  query_transactions: 'Looking through your transactions',
  web_search: 'Checking public sources',
  deep_research: 'Researching across several public sources',
  forecast_cashflow: 'Projecting your cash flow',
  project_goal: 'Projecting your goal',
  evaluate_asp_progress: 'Checking ASP rules',
};
const WEB_TOOLS = new Set(['web_search', 'deep_research']);
export const CALCULATING_STEP = { type: 'step', id: 'app-calculation', label: 'Calculating from your transactions' } as const satisfies CoachProgress;

/** Hostnames of web pages in a tool output, without paths or query strings. */
export function sourceDomains(output: unknown, max = 5) {
  let data: unknown = output;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return []; } }
  if (!data || typeof data !== 'object') return [];
  const record = data as Record<string, unknown>;
  const rows = [record.results, record.sources, ...(Array.isArray(record.citations)
    ? record.citations.map(c => c && typeof c === 'object' ? c.sources : undefined) : [])];
  const domains: string[] = [];
  for (const group of rows) for (const row of Array.isArray(group) ? group : []) {
    if (!row || typeof row.url !== 'string') continue;
    try {
      const url = new URL(row.url);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue;
      const domain = url.hostname.toLowerCase().replace(/^www\./, '');
      if (!domains.includes(domain)) domains.push(domain);
      if (domains.length >= max) return domains;
    } catch { /* not a source URL */ }
  }
  return domains;
}

type Chunk = { type: string; toolCallId?: string; toolName?: string; output?: unknown; kind?: string; delta?: string };

/** Maps Flue stream chunks to progress events. Keeps the tool name per call to find web outputs. */
export function progressMapper() {
  const tools = new Map<string, string>();
  return (chunk: Chunk): CoachProgress[] => {
    if (chunk.type === 'tool-input' && chunk.toolCallId && chunk.toolName) {
      tools.set(chunk.toolCallId, chunk.toolName);
      return [{ type: 'step', id: chunk.toolCallId, label: TOOL_LABELS[chunk.toolName] ?? 'Working it out' }];
    }
    if ((chunk.type === 'tool-output' || chunk.type === 'tool-output-error') && chunk.toolCallId) {
      const events: CoachProgress[] = [];
      if (chunk.type === 'tool-output' && WEB_TOOLS.has(tools.get(chunk.toolCallId) ?? '')) {
        const domains = sourceDomains(chunk.output);
        if (domains.length) events.push({ type: 'sources', id: chunk.toolCallId, domains });
      }
      events.push({ type: 'step-done', id: chunk.toolCallId });
      return events;
    }
    if (chunk.type === 'message-delta' && chunk.kind === 'text' && chunk.delta) return [{ type: 'text', delta: chunk.delta }];
    return [];
  };
}

export type ProgressState = { steps: { id: string; label: string; done: boolean }[]; sources: string[]; text: string };
export const emptyProgress: ProgressState = { steps: [], sources: [], text: '' };

/** What the coach screen shows while an answer streams in. */
export function applyProgress(state: ProgressState, event: CoachProgress): ProgressState {
  switch (event.type) {
    case 'step': return state.steps.some(s => s.id === event.id) ? state : { ...state, steps: [...state.steps, { id: event.id, label: event.label, done: false }] };
    case 'step-done': return { ...state, steps: state.steps.map(s => s.id === event.id ? { ...s, done: true } : s) };
    case 'sources': return { ...state, sources: [...new Set([...state.sources, ...event.domains])] };
    case 'text': return { ...state, text: state.text + event.delta };
  }
}
