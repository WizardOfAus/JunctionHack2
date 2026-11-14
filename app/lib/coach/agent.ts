// Server-side bridge from the coach chat to the Flue agent in agent/.
// The agent runs as its own server. Set KOTI_AGENT_URL to turn the bridge on;
// without it, the coach route keeps the deterministic demo answers.
import { env } from 'cloudflare:workers';
import { freshAgentRequest } from './request';
import { createFlueClient, FlueApiError, FlueExecutionError } from '@flue/sdk';

type AgentEnv = { KOTI_AGENT_URL?: string; KOTI_AGENT_TOKEN?: string };

/** Longest time one chat answer can take, including tool calls. */
const REPLY_TIMEOUT_MS = 60_000;


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

export class AgentUnavailableError extends Error {}

/**
 * Sends one question to the agent and waits for its reply.
 * The server sets the customer scope. The browser never chooses it.
 * `appContext` is text that the app server calculates (see context.ts). It goes after the question
 * in a <koti_app_context> block, so the agent can tell it apart from the user's words.
 */
export async function askAgent(config: AgentConfig, input: { customerId: string; question: string; appContext?: string }) {
  const request = freshAgentRequest(input.customerId, input.question, input.appContext);
  const conversation = createFlueClient({
    url: `${config.url}/${encodeURIComponent(request.conversationId)}`,
    token: config.token,
  });
  const signal = AbortSignal.timeout(REPLY_TIMEOUT_MS);
  try {
    const admission = await conversation.send({
      ...request.options,
      signal,
    });
    const reply = await conversation.read(admission, { signal });
    return { text: reply.text.trim(), submissionId: reply.submissionId, conversationId: request.conversationId };
  } catch (error) {
    if (error instanceof FlueApiError || error instanceof FlueExecutionError) {
      throw new AgentUnavailableError(error.message, { cause: error });
    }
    if (signal.aborted) throw new AgentUnavailableError('The agent did not answer in time.', { cause: error });
    throw new AgentUnavailableError('The agent server could not be reached.', { cause: error });
  }
}
