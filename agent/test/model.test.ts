import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertModelConfig, MODEL } from '../src/model.ts';

test('the agent uses only OpenAI GPT-6 Luna', () => {
	assert.equal(MODEL, 'openai/gpt-6-luna');
});

test('a different KOTI_MODEL stops start-up', () => {
	assert.throws(() => assertModelConfig({ KOTI_MODEL: 'anthropic/claude-sonnet-5-5' }), /KOTI_MODEL is not supported/);
	assert.doesNotThrow(() => assertModelConfig({}));
	assert.doesNotThrow(() => assertModelConfig({ KOTI_MODEL: MODEL }));
});
