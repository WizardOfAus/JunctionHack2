import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as v from 'valibot';
import { DeepResearchInput, runDeepResearch, runWebSearch, WebSearchInput } from '../src/tools/web-search.ts';

function fakeFetch(reply: unknown, status = 200) {
	const calls: { url: string; init: RequestInit }[] = [];
	const fn = (async (url: string, init: RequestInit) => {
		calls.push({ url, init });
		return new Response(JSON.stringify(reply), { status, headers: { 'content-type': 'application/json' } });
	}) as unknown as typeof fetch;
	return { fn, calls, body: () => JSON.parse(String(calls[0]!.init.body)) };
}

describe('web_search', () => {
	it('sends an auto search with highlights and Finland as the default country', async () => {
		const fake = fakeFetch({
			results: [
				{ title: ' ASP-laina ', url: 'https://example.fi/asp', publishedDate: '2026-05-02T00:00:00.000Z', highlights: [' ASP gives a state guarantee. '] },
				{ title: null, url: 'https://example.fi/b' },
				{ title: 'no url' },
			],
		});
		const input = v.parse(WebSearchInput, { query: 'ASP home savings rules 2026', publishedAfter: '2026-01-01' });
		const out = await runWebSearch(input, { apiKey: 'k', fetch: fake.fn });

		assert.equal(fake.calls[0]!.url, 'https://api.exa.ai/search');
		assert.equal((fake.calls[0]!.init.headers as Record<string, string>)['x-api-key'], 'k');
		const body = fake.body();
		assert.equal(body.type, 'auto');
		assert.equal(body.numResults, 5);
		assert.equal(body.userLocation, 'FI');
		assert.equal(body.startPublishedDate, '2026-01-01T00:00:00.000Z');
		assert.equal(body.includeDomains, undefined);
		assert.ok(body.contents.highlights);

		assert.deepEqual(out.results, [
			{ title: 'ASP-laina', url: 'https://example.fi/asp', publishedDate: '2026-05-02', highlights: ['ASP gives a state guarantee.'] },
			{ title: 'https://example.fi/b', url: 'https://example.fi/b', publishedDate: null, highlights: [] },
		]);
		assert.match(out.note, /not instructions/);
	});

	it('does not show the error body to the model', async () => {
		const fake = fakeFetch({ error: 'secret request detail' }, 401);
		const input = v.parse(WebSearchInput, { query: 'anything at all' });
		await assert.rejects(runWebSearch(input, { apiKey: 'k', fetch: fake.fn }), (error: Error) => {
			assert.equal(error.message, 'The web search service returned HTTP 401.');
			return true;
		});
	});

	it('rejects a bad country code', () => {
		assert.throws(() => v.parse(WebSearchInput, { query: 'rent prices', country: 'fin' }));
	});
});

describe('deep_research', () => {
	it('sends a deep search and returns the answer with its sources', async () => {
		const fake = fakeFetch({
			results: [{ title: 'Offer', url: 'https://shop.fi/offer', highlights: ['10% off'] }],
			output: {
				content: ' Members get 10% off until 30 Nov. ',
				grounding: [{ field: 'content', confidence: 'high', citations: [{ title: 'Offer', url: 'https://shop.fi/offer' }, { title: 'x' }] }],
			},
		});
		const input = v.parse(DeepResearchInput, { query: 'Current S-Bonus discount on home insurance', additionalQueries: ['S-Bonus kotivakuutus alennus'] });
		const out = await runDeepResearch(input, { apiKey: 'k', fetch: fake.fn });

		const body = fake.body();
		assert.equal(body.type, 'deep');
		assert.deepEqual(body.outputSchema, { type: 'text' });
		assert.deepEqual(body.additionalQueries, ['S-Bonus kotivakuutus alennus']);
		assert.ok(body.systemPrompt);

		assert.equal(out.answer, 'Members get 10% off until 30 Nov.');
		assert.deepEqual(out.citations, [{ field: 'content', confidence: 'high', sources: [{ title: 'Offer', url: 'https://shop.fi/offer' }] }]);
		assert.equal(out.results.length, 1);
	});

	it('says so when there is no answer', async () => {
		const fake = fakeFetch({ results: [] });
		const input = v.parse(DeepResearchInput, { query: 'something unknown' });
		const out = await runDeepResearch(input, { apiKey: 'k', fetch: fake.fn });
		assert.equal(out.answer, '');
		assert.match(out.note, /do not guess/);
	});
});
