// Transport stays independent of Cloudflare bindings so the real SDK path is testable.
import { createFlueClient, FlueApiError, FlueExecutionError, FetchError, FetchBackoffAbortError } from '@flue/sdk';
import { freshAgentRequest } from './request';
import type { AgentConfig } from './agent';
import { progressMapper, type CoachProgress } from './progress';

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
export async function askAgent(config: AgentConfig, input: { customerId: string; question: string; appContext?: string },
  options: { onProgress?: (event: CoachProgress) => void; signal?: AbortSignal; onAdmitted?: (capability: string) => void } = {}) {
  const request = freshAgentRequest(input.customerId, input.question, input.appContext);
  const conversation = createFlueClient({
    url: `${config.url}/${encodeURIComponent(request.conversationId)}`,
    token: config.token,
  });
  const timeout = AbortSignal.timeout(REPLY_TIMEOUT_MS);
  // The caller can cancel (the browser left); that is not an outage, so it never triggers the fallback.
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  const map = progressMapper();
  const onEvent = options.onProgress ? (chunk: Parameters<typeof map>[0]) => { for (const event of map(chunk)) options.onProgress!(event); } : undefined;
  let abortWork: Promise<unknown> | undefined;
  // Stopping the event reader does not stop durable model/tool execution.
  const stopWork = () => { abortWork ??= conversation.abort({ signal: AbortSignal.timeout(5000) }).catch(() => {}); };
  try {
    const admission = await conversation.send({
      ...request.options,
      signal,
    });
    options.onAdmitted?.(request.conversationId);
    signal.addEventListener('abort', stopWork, { once: true });
    if (signal.aborted) stopWork();
    const reply = await conversation.read(admission, { signal, onEvent });
    return { text: reply.text.trim(), submissionId: reply.submissionId, conversationId: request.conversationId };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (isAgentOutage(error, signal)) throw new AgentUnavailableError('The AI coach is temporarily unavailable.', { cause: error });
    throw error;
  } finally {
    signal.removeEventListener('abort', stopWork);
    await abortWork;
  }
}

/** A random per-question conversation id is a bearer capability to stop that run only.
 * It never permits reading/resuming a conversation or selecting a customer. */
export async function cancelAgent(config: AgentConfig, capability: string) {
  if (!/^koti-app-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(capability)) throw new Error('Invalid cancellation capability');
  return createFlueClient({url:`${config.url}/${capability}`, token:config.token}).abort({signal:AbortSignal.timeout(5000)});
}
