import type { INodeListSearchItems, INodePropertyOptions } from 'n8n-workflow';

export const BASE_URL = 'https://api.lowrouter.ai/v1';

type Range = { min?: number; max?: number };

export type LowRouterModel = {
	id: string;
	lifecycle?: string;
	modality?: string;
	endpoints?: string[];
	capabilities?: { function_calling?: boolean };
	context_length?: number;
	auto_routing?: {
		pricing_range?: {
			currency?: string;
			prompt_per_1m_tokens?: Range;
			completion_per_1m_tokens?: Range;
		};
		carbon_range?: { carbon_per_token_gco2e?: Range };
	};
};

export type Jurisdiction = { id: string; description?: string; auto_scope?: string };

// auto/<creator>/<model>, with no scope suffix.
const UNSCOPED_AUTO_ID = /^auto\/[^/]+\/[^/]+$/;

export function isUnscopedAuto(id: string): boolean {
	return UNSCOPED_AUTO_ID.test(id);
}

function isAgentReady(model: LowRouterModel): boolean {
	return (
		isUnscopedAuto(model.id) &&
		model.lifecycle === 'active' &&
		model.modality === 'chat' &&
		model.capabilities?.function_calling === true
	);
}

function formatRange(range: Range | undefined): string | undefined {
	// The API may send null for an unknown bound.
	if (typeof range?.min !== 'number' || typeof range.max !== 'number') return undefined;
	const round = (n: number) => Number(n.toPrecision(3));
	return range.min === range.max
		? `${round(range.min)}`
		: `${round(range.min)}-${round(range.max)}`;
}

export function describeModel(model: LowRouterModel): string | undefined {
	const parts: string[] = [];
	const pricing = model.auto_routing?.pricing_range;
	const input = formatRange(pricing?.prompt_per_1m_tokens);
	const output = formatRange(pricing?.completion_per_1m_tokens);
	if (input && output) {
		parts.push(`${pricing?.currency ?? ''} ${input} in / ${output} out per 1M tokens`.trim());
	}
	const carbon = formatRange(model.auto_routing?.carbon_range?.carbon_per_token_gco2e);
	if (carbon) parts.push(`${carbon} gCO2e per token`);
	if (model.context_length) parts.push(`${model.context_length.toLocaleString('en-US')} context`);
	return parts.length ? parts.join(' · ') : undefined;
}

export function toListItems(
	models: LowRouterModel[],
	{ showAll, filter }: { showAll: boolean; filter?: string },
): INodeListSearchItems[] {
	const needle = filter?.toLowerCase();
	return models
		.filter((model) => showAll || isAgentReady(model))
		.filter((model) => !needle || model.id.toLowerCase().includes(needle))
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((model) => ({ name: model.id, value: model.id, description: describeModel(model) }));
}

/**
 * The scopes LowRouter lists for this model: the 4th segment of every
 * `<model>/<scope>` ID in the catalogue.
 */
export function scopesFor(models: LowRouterModel[], modelId: string): string[] {
	if (!isUnscopedAuto(modelId)) return [];
	const prefix = `${modelId}/`;
	return models
		.filter((model) => model.id.startsWith(prefix))
		.map((model) => model.id.slice(prefix.length))
		.filter((scope) => !scope.includes('/'))
		.sort();
}

export function toRegionOptions(
	scopes: string[],
	jurisdictions: Jurisdiction[],
): INodePropertyOptions[] {
	const described = new Map(jurisdictions.map((j) => [j.auto_scope ?? j.id, j.description]));
	return [
		{
			name: 'Any',
			value: '',
			description: "Let LowRouter pick the route under your key's routing policy",
		},
		...scopes.map((scope) => ({
			name: scope,
			value: scope,
			description: described.get(scope) ?? `Only routes in the '${scope}' scope`,
		})),
	];
}

/**
 * LowRouter serves Chat Completions natively and translates Responses onto it,
 * so Responses is used only for a model that does not list Chat Completions.
 */
export function prefersResponsesApi(endpoints: string[] | undefined): boolean {
	return !!endpoints?.includes('responses') && !endpoints.includes('chat.completions');
}
