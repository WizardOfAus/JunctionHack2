// Server-side bridge from the coach chat to the Flue agent in agent/.
// The agent runs as its own server. Set KOTI_AGENT_URL to turn the bridge on;
// without it, the coach route keeps the deterministic demo answers.
import { env } from 'cloudflare:workers';
export { askAgent, AgentUnavailableError } from './transport';

type AgentEnv = { KOTI_AGENT_URL?: string; KOTI_AGENT_TOKEN?: string };



export interface AgentConfig {
  /** Agent mount URL, for example http://localhost:5180/agents/koti */
  url: string;
  token?: string;
}

export function agentConfig(): AgentConfig | null {
  const { KOTI_AGENT_URL, KOTI_AGENT_TOKEN } = env as unknown as AgentEnv;
  const url = KOTI_AGENT_URL?.trim().replace(/\/+$/, '');
  if (!url) return null;
  return { url, token: KOTI_AGENT_TOKEN?.trim() || undefined };
}
