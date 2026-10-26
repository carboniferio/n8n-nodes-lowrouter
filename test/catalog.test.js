// Runs against the build output: `npm test` builds first.
const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
	describeModel,
	prefersResponsesApi,
	scopesFor,
	toListItems,
	toRegionOptions,
	isUnscopedAuto,
	isNotFound,
	unscopedBase,
} = require('../dist/nodes/LmChatLowRouter/catalog.js');

const chat = (id, extra = {}) => ({
	id,
	lifecycle: 'active',
	modality: 'chat',
	endpoints: ['chat.completions', 'messages', 'responses'],
	capabilities: { streaming: true, function_calling: true },
	...extra,
});

const catalog = [
	chat('auto/mistralai/mistral-large-2512'),
	chat('auto/mistralai/mistral-large-2512/eu'),
	chat('auto/mistralai/mistral-large-2512/eu-sovereign'),
	chat('auto/openai/gpt-oss-120b'),
	chat('auto/openai/gpt-oss-120b/us'),
	chat('auto/openai/gpt-oss-120b/eu', { lifecycle: 'deprecated' }),
	chat('auto/old/model', { lifecycle: 'deprecated' }),
	chat('auto/lighton/ocr', { capabilities: { streaming: true } }),
	chat('auto/baai/bge-m3', { modality: 'embedding', endpoints: ['embeddings'] }),
	chat('mistral/mistralai/mistral-large-2512/fr-par'),
];

test('default list keeps active unscoped auto chat models with tool calling', () => {
	const ids = toListItems(catalog, { showAll: false }).map((item) => item.value);
	assert.deepEqual(ids, ['auto/mistralai/mistral-large-2512', 'auto/openai/gpt-oss-120b']);
});

test('show all lists every ID, sorted', () => {
	const ids = toListItems(catalog, { showAll: true }).map((item) => item.value);
	assert.equal(ids.length, catalog.length);
	assert.deepEqual(ids, [...ids].sort((a, b) => a.localeCompare(b)));
});

test('search filter is case-insensitive and trimmed', () => {
	const ids = toListItems(catalog, { showAll: false, filter: ' MISTRAL ' }).map((i) => i.value);
	assert.deepEqual(ids, ['auto/mistralai/mistral-large-2512']);
});

test('scopes come from the scoped IDs LowRouter lists for the model', () => {
	assert.deepEqual(scopesFor(catalog, 'auto/mistralai/mistral-large-2512'), ['eu', 'eu-sovereign']);
	assert.deepEqual(scopesFor(catalog, 'auto/openai/gpt-oss-120b'), ['us']);
	assert.deepEqual(scopesFor(catalog, 'Auto/OpenAI/gpt-oss-120b'), ['us']);
	assert.deepEqual(scopesFor(catalog, 'mistral/mistralai/mistral-large-2512/fr-par'), []);
});

test('region options start with Any and use jurisdiction descriptions', () => {
	const options = toRegionOptions(
		['eu', 'us'],
		[{ id: 'eu-eea-hosted', auto_scope: 'eu', description: 'EU/EEA region' }],
	);
	assert.deepEqual(
		options.map((o) => o.value),
		['', 'eu', 'us'],
	);
	assert.equal(options[1].description, 'EU/EEA region');
	assert.match(options[2].description, /'us'/);
});

test('only unscoped auto IDs take a region', () => {
	assert.equal(isUnscopedAuto('auto/a/b'), true);
	assert.equal(isUnscopedAuto('Auto/a/b'), true);
	assert.equal(isUnscopedAuto('auto/a/b/us'), false);
	assert.equal(isUnscopedAuto('mistral/a/b/fr-par'), false);
});

test('the unscoped base is found only for scoped auto IDs', () => {
	assert.equal(unscopedBase('auto/a/b/fr'), 'auto/a/b');
	assert.equal(unscopedBase('Auto/A/b/EU'), 'Auto/A/b');
	assert.equal(unscopedBase('auto/a/b'), undefined);
	assert.equal(unscopedBase('auto/a/b/eu/x'), undefined);
	assert.equal(unscopedBase('mistral/a/b/fr-par'), undefined);
});

test('Responses API only when the model lacks Chat Completions', () => {
	assert.equal(prefersResponsesApi(['chat.completions', 'messages', 'responses']), false);
	assert.equal(prefersResponsesApi(['responses']), true);
	assert.equal(prefersResponsesApi([]), false);
	assert.equal(prefersResponsesApi(undefined), false);
});

test('description shows price, carbon and context', () => {
	const description = describeModel(
		chat('auto/a/b', {
			context_length: 128000,
			auto_routing: {
				pricing_range: {
					currency: 'EUR',
					prompt_per_1m_tokens: { min: 0.1, max: 0.2 },
					completion_per_1m_tokens: { min: 0.4, max: 0.4 },
				},
				carbon_range: { carbon_per_token_gco2e: { min: 0.0001, max: 0.0001 } },
			},
		}),
	);
	assert.equal(
		description,
		'EUR 0.1-0.2 in / 0.4 out per 1M tokens · 0.0001 gCO2e per token · 128,000 context',
	);
	assert.equal(describeModel(chat('auto/a/b')), undefined);
	assert.equal(
		describeModel(
			chat('auto/a/b', {
				auto_routing: { carbon_range: { carbon_per_token_gco2e: { min: null, max: null } } },
			}),
		),
		undefined,
	);
});

test('404 is recognised from NodeApiError and raw HTTP errors', () => {
	assert.equal(isNotFound({ httpCode: '404' }), true);
	assert.equal(isNotFound({ response: { status: 404 } }), true);
	assert.equal(isNotFound({ httpCode: '503' }), false);
	assert.equal(isNotFound(new Error('timeout')), false);
});
