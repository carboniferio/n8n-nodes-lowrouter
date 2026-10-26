import type {
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	ISupplyDataFunctions,
	SupplyData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { supplyModel } from '@n8n/ai-node-sdk';

import type { Jurisdiction, LowRouterModel } from './catalog';
import {
	BASE_URL,
	isNotFound,
	isUnscopedAuto,
	prefersResponsesApi,
	scopesFor,
	toListItems,
	toRegionOptions,
	unscopedBase,
} from './catalog';

type ModelOptions = {
	temperature?: number;
	maxTokens?: number;
	reasoningEffort?: string;
};

async function apiGet<T>(
	ctx: ILoadOptionsFunctions | ISupplyDataFunctions,
	path: string,
	timeout?: number,
) {
	return (await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'lowRouterApi', {
		method: 'GET',
		url: `${BASE_URL}${path}`,
		json: true,
		timeout,
	})) as T;
}

// Without a timeout a stalled list request never settles, and the cached catalogue
// promise would leave every search for that credential waiting on it.
const LIST_TIMEOUT_MS = 30_000;

async function getList<T>(ctx: ILoadOptionsFunctions, path: string): Promise<T[]> {
	return (await apiGet<{ data?: T[] }>(ctx, path, LIST_TIMEOUT_MS)).data ?? [];
}

// The catalogue is large (over 1 MB) and every search keystroke or region
// dropdown would refetch it: keep the last response for a short while.
const CATALOGUE_TTL_MS = 60_000;
// Keyed by credential ID, so the cache never holds the API key itself.
let catalogueCache:
	| { credentialId: string; at: number; models: Promise<LowRouterModel[]> }
	| undefined;

async function getModels(ctx: ILoadOptionsFunctions): Promise<LowRouterModel[]> {
	const credentialId = ctx.getNode().credentials?.lowRouterApi?.id;
	// Without an ID there is nothing to key on: fetch without evicting another credential's entry.
	if (!credentialId) return await getList<LowRouterModel>(ctx, '/models');
	const now = Date.now();
	if (catalogueCache?.credentialId !== credentialId || now - catalogueCache.at > CATALOGUE_TTL_MS) {
		const models = getList<LowRouterModel>(ctx, '/models');
		catalogueCache = { credentialId, at: now, models };
		// Do not keep a failed fetch around.
		models.catch(() => {
			if (catalogueCache?.models === models) catalogueCache = undefined;
		});
	}
	return await catalogueCache.models;
}

function modelPath(modelId: string): string {
	return `/models/${modelId.split('/').map(encodeURIComponent).join('/')}`;
}

// The model lookup only picks the API flavour: a stalled one must not hold up the run.
const LOOKUP_TIMEOUT_MS = 10_000;

async function getEndpoints(
	ctx: ISupplyDataFunctions,
	modelId: string,
): Promise<string[] | undefined> {
	try {
		return (await apiGet<LowRouterModel>(ctx, modelPath(modelId), LOOKUP_TIMEOUT_MS)).endpoints;
	} catch (error) {
		// Other failures surface on the chat request itself; default to Chat Completions.
		// An unscoped 404 is not conclusive either: /models/{id} does not resolve every ID
		// the chat endpoint accepts, such as version-less pinned shorthands
		// (mistral/mistralai/mistral-large), so let the chat request decide.
		// A scoped auto ID is checked the same way whether the scope came from Region or was typed.
		const baseModel = unscopedBase(modelId);
		if (!isNotFound(error) || !baseModel) return undefined;
		// A scoped ID is missing either because the model is wrong or because it has no route in the region.
		const base = await apiGet(ctx, modelPath(baseModel), LOOKUP_TIMEOUT_MS).then(
			() => 'found' as const,
			(baseError) => (isNotFound(baseError) ? ('missing' as const) : ('unknown' as const)),
		);
		throw new NodeOperationError(ctx.getNode(), `LowRouter has no model '${modelId}'`, {
			description: {
				found:
					'The model has no routes in this scope: pick another region or set it to Any, or drop the scope from the model ID.',
				missing: 'Check the model ID.',
				unknown: 'Check the model ID, or pick another region or set it to Any.',
			}[base],
		});
	}
}

export class LmChatLowRouter implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LowRouter Chat Model',
		name: 'lmChatLowRouter',
		icon: { light: 'file:../../icons/lowrouter.svg', dark: 'file:../../icons/lowrouter.dark.svg' },
		group: ['transform'],
		version: [1],
		subtitle: '={{$parameter.model.value + ($parameter.region ? "/" + $parameter.region : "")}}',
		description: 'Chat models routed by LowRouter, with region and sovereignty controls',
		defaults: {
			name: 'LowRouter Chat Model',
		},
		codex: {
			categories: ['assistant'],
			subcategories: {
				AI: ['Language Models', 'Root Nodes'],
				'Language Models': ['Chat Models (Recommended)'],
			},
			resources: {
				primaryDocumentation: [
					{ url: 'https://github.com/carboniferio/n8n-nodes-lowrouter#readme' },
				],
			},
		},

		inputs: [],

		outputs: [NodeConnectionTypes.AiLanguageModel],
		outputNames: ['Model'],
		credentials: [
			{
				name: 'lowRouterApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Show All Models',
				name: 'showAllModels',
				type: 'boolean',
				default: false,
				description:
					'Whether to list every model ID, including pinned routes, scoped IDs and models without tool calling. By default the list shows active auto-routed chat models that support tool calling.',
			},
			{
				displayName: 'Model',
				name: 'model',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				description: 'The model which will generate the completion',
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: {
							searchListMethod: 'searchModels',
							searchable: true,
						},
					},
					{
						displayName: 'ID',
						name: 'id',
						type: 'string',
						placeholder: 'auto/mistralai/mistral-large-2512',
					},
				],
			},
			{
				displayName: 'Region Name or ID',
				name: 'region',
				type: 'options',
				default: '',
				description:
					'Restrict routing to a jurisdiction. Applies to auto-routed models; the list shows the scopes LowRouter offers for the selected model. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				typeOptions: {
					loadOptionsMethod: 'getRegions',
					loadOptionsDependsOn: ['model.value'],
				},
			},
			{
				displayName: 'Options',
				name: 'options',
				placeholder: 'Add Option',
				description: 'Additional options to add',
				type: 'collection',
				default: {},
				options: [
					{
						displayName: 'Maximum Number of Tokens',
						name: 'maxTokens',
						default: 1024,
						description: 'The maximum number of tokens to generate in the completion',
						type: 'number',
						typeOptions: { minValue: 1 },
					},
					{
						displayName: 'Reasoning Effort',
						name: 'reasoningEffort',
						default: 'medium',
						description:
							'How much the model should think before answering. LowRouter maps it to each provider and uses the nearest level a model accepts.',
						type: 'options',
						options: [
							{ name: 'Extra High', value: 'xhigh' },
							{ name: 'High', value: 'high' },
							{ name: 'Low', value: 'low' },
							{ name: 'Medium', value: 'medium' },
							{ name: 'Minimal', value: 'minimal' },
							{ name: 'None', value: 'none' },
						],
					},
					{
						displayName: 'Sampling Temperature',
						name: 'temperature',
						default: 0.7,
						typeOptions: { maxValue: 2, minValue: 0, numberPrecision: 1 },
						description:
							'Controls randomness: Lowering results in less random completions. As the temperature approaches zero, the model will become deterministic and repetitive.',
						type: 'number',
					},
				],
			},
		],
	};

	methods = {
		listSearch: {
			async searchModels(
				this: ILoadOptionsFunctions,
				filter?: string,
			): Promise<INodeListSearchResult> {
				const models = await getModels(this);
				const showAll = this.getCurrentNodeParameter('showAllModels') === true;
				return { results: toListItems(models, { showAll, filter }) };
			},
		},
		loadOptions: {
			async getRegions(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const value = this.getCurrentNodeParameter('model', { extractValue: true });
				const modelId = typeof value === 'string' ? value.trim() : '';
				// Only unscoped auto IDs take a region: skip the catalogue fetch for the rest.
				if (!isUnscopedAuto(modelId)) return toRegionOptions([], []);
				const [models, jurisdictions] = await Promise.all([
					getModels(this),
					// Descriptions only: a failed lookup must not take the scopes down with it.
					getList<Jurisdiction>(this, '/jurisdictions').catch((): Jurisdiction[] => []),
				]);
				return toRegionOptions(scopesFor(models, modelId), jurisdictions);
			},
		},
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const baseModel = String(
			this.getNodeParameter('model', itemIndex, '', { extractValue: true }) ?? '',
		).trim();
		const region = String(this.getNodeParameter('region', itemIndex, '') ?? '').trim();
		const options = this.getNodeParameter('options', itemIndex, {}) as ModelOptions;
		if (!baseModel) {
			throw new NodeOperationError(this.getNode(), 'No model selected', {
				description: 'Pick a model from the list or enter a LowRouter model ID.',
			});
		}
		if (region.includes('/')) {
			throw new NodeOperationError(this.getNode(), `Region '${region}' is not a single scope`, {
				description: "A region is one scope segment, such as 'eu'.",
			});
		}
		if (region && !isUnscopedAuto(baseModel)) {
			throw new NodeOperationError(
				this.getNode(),
				`Region '${region}' only applies to auto/<creator>/<model> IDs, not '${baseModel}'`,
				{ description: 'Pick an unscoped auto-routed model, or set Region to Any.' },
			);
		}
		const model = region ? `${baseModel}/${region}` : baseModel;

		const [credentials, endpoints] = await Promise.all([
			this.getCredentials('lowRouterApi'),
			getEndpoints(this, model),
		]);
		const useResponsesApi = prefersResponsesApi(endpoints);
		// ChatOpenAI only forwards `reasoning` for model names it recognises as
		// OpenAI reasoning models, which LowRouter IDs never are.
		const additionalParams = !options.reasoningEffort
			? undefined
			: useResponsesApi
				? { reasoning: { effort: options.reasoningEffort } }
				: { reasoning_effort: options.reasoningEffort };

		return supplyModel(this, {
			type: 'openai',
			baseUrl: BASE_URL,
			apiKey: credentials.apiKey as string,
			model,
			useResponsesApi,
			temperature: options.temperature,
			maxTokens: options.maxTokens,
			additionalParams,
		});
	}
}
