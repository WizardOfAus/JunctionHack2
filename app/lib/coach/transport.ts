// Transport stays independent of Cloudflare bindings so the real SDK path is testable.
import { createFlueClient, FlueApiError, FlueExecutionError, FetchError, FetchBackoffAbortError } from '@flue/sdk';
import { freshAgentRequest } from './request';
import type { AgentConfig } from './agent';

const REPLY_TIMEOUT_MS = 60_000;
export class AgentUnavailableError extends Error {}

/** Only retryable transport/execution failures permit a calculated fallback. */
export function isAgentOutage(error: unknown, signal: AbortSignal): boolean {
  if (error instanceof FlueApiError || error instanceof FetchError) return error.status === 408 || error.status === 429 || error.status >= 500;
  if (error instanceof FlueExecutionError || error instanceof FetchBackoffAbortError || signal.aborted) return true;
  if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) return true;
  // Fetch network rejections vary between Node and workerd. Do not catch arbitrary TypeErrors.
  if (error instanceof Error && /^(fetch failed|failed to fetch|networkerror when attempting to fetch resource\.?|network connection lost\.?)$/i.test(error.message)) return true;
  const cause = error instanceof Error ? error.cause : undefined;
  return typeof cause === 'object' && cause !== null && 'code' in cause &&
    ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(String(cause.code));
}

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
    if (isAgentOutage(error, signal)) throw new AgentUnavailableError('The AI coach is temporarily unavailable.', { cause: error });
    throw error;
  }
}
