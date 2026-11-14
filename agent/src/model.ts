/**
 * The one model and endpoint for the Koti agent: OpenAI GPT-6.1 Sol through the OpenAI API
 * (https://api.openai.com/v1, key from OPENAI_API_KEY). Other providers are not configured.
 * To change the model, change this constant in a reviewed PR, not an environment variable.
 */
export const MODEL = 'openai/gpt-6.1-sol';

/** Stops start-up when someone sets the removed KOTI_MODEL override to a different model. */
export function assertModelConfig(env: NodeJS.ProcessEnv = process.env): void {
	const override = env.KOTI_MODEL?.trim();
	if (override && override !== MODEL) {
		throw new Error(`KOTI_MODEL is not supported. The Koti agent uses only ${MODEL}. Remove KOTI_MODEL from the environment.`);
	}
}
