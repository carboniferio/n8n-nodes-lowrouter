import type { INodeListSearchItems, INodePropertyOptions } from 'n8n-workflow';

export const BASE_URL = 'https://api.lowrouter.ai/v1';

export type LowRouterModel = {
	id: string;
	lifecycle?: string;
	modality?: string;
	endpoints?: string[];
	capabilities?: { function_calling?: boolean };
};

export type Jurisdiction = { id: string; description?: string; auto_scope?: string };

// auto/<creator>/<model>, with no scope suffix. LowRouter IDs are case-insensitive.
const UNSCOPED_AUTO_ID = /^auto\/[^/]+\/[^/]+$/i;

export function isUnscopedAuto(id: string): boolean {
	return UNSCOPED_AUTO_ID.test(id);
}

// auto/<creator>/<model>/<scope>: captures the unscoped part.
const SCOPED_AUTO_ID = /^(auto\/[^/]+\/[^/]+)\/[^/]+$/i;

/** The unscoped auto ID behind a scoped one, or undefined when the ID has no scope. */
export function unscopedBase(id: string): string | undefined {
	return SCOPED_AUTO_ID.exec(id)?.[1];
}

function isAgentReady(model: LowRouterModel): boolean {
	return (
		isUnscopedAuto(model.id) &&
		model.lifecycle === 'active' &&
		model.modality === 'chat' &&
		model.capabilities?.function_calling === true
	);
}

export function toListItems(
	models: LowRouterModel[],
	{ showAll, filter }: { showAll: boolean; filter?: string },
): INodeListSearchItems[] {
	const needle = filter?.trim().toLowerCase();
	return models
		.filter((model) => showAll || isAgentReady(model))
		.filter((model) => !needle || model.id.toLowerCase().includes(needle))
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((model) => ({ name: model.id, value: model.id }));
}

/**
 * The scopes LowRouter lists for this model: the 4th segment of every
 * `<model>/<scope>` ID in the catalogue that is not deprecated.
 */
export function scopesFor(models: LowRouterModel[], modelId: string): string[] {
	if (!isUnscopedAuto(modelId)) return [];
	const prefix = `${modelId}/`.toLowerCase();
	return models
		.filter(
			(model) => model.id.toLowerCase().startsWith(prefix) && model.lifecycle !== 'deprecated',
		)
		.map((model) => model.id.slice(prefix.length))
		.filter((scope) => !scope.includes('/'))
		.sort((a, b) => a.localeCompare(b));
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

export function isNotFound(error: unknown): boolean {
	// NodeApiError carries the HTTP status as a string; a raw Axios error as a number.
	const { httpCode, response } = error as { httpCode?: unknown; response?: { status?: unknown } };
	return String(httpCode ?? response?.status) === '404';
}

/**
 * LowRouter serves Chat Completions natively and translates Responses onto it,
 * so Responses is used only for a model that does not list Chat Completions.
 */
export function prefersResponsesApi(endpoints: string[] | undefined): boolean {
	return !!endpoints?.includes('responses') && !endpoints.includes('chat.completions');
}
