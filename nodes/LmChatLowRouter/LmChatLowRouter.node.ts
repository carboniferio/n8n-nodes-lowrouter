import type {
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	ISupplyDataFunctions,
	SupplyData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { supplyModel } from '@n8n/ai-node-sdk';

import type { Jurisdiction, LowRouterModel } from './catalog';
import {
	BASE_URL,
	prefersResponsesApi,
	scopesFor,
	toListItems,
	toRegionOptions,
	withRegion,
} from './catalog';

type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

type ModelOptions = {
	temperature?: number;
	maxTokens?: number;
	reasoningEffort?: ReasoningEffort;
};

async function getList<T>(ctx: ILoadOptionsFunctions, path: string): Promise<T[]> {
	const response = (await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'lowRouterApi', {
		method: 'GET',
		url: `${BASE_URL}${path}`,
		json: true,
	})) as { data?: T[] };
	return response.data ?? [];
}

async function getEndpoints(
	ctx: ISupplyDataFunctions,
	modelId: string,
): Promise<string[] | undefined> {
	const request: IHttpRequestOptions = {
		method: 'GET',
		url: `${BASE_URL}/models/${modelId.split('/').map(encodeURIComponent).join('/')}`,
		json: true,
	};
	try {
		const model = (await ctx.helpers.httpRequestWithAuthentication.call(
			ctx,
			'lowRouterApi',
			request,
		)) as LowRouterModel;
		return model.endpoints;
	} catch {
		// The chat request itself reports an unknown model; default to Chat Completions here.
		return undefined;
	}
}

export class LmChatLowRouter implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LowRouter Chat Model',
		name: 'lmChatLowRouter',
		icon: { light: 'file:../../icons/lowrouter.svg', dark: 'file:../../icons/lowrouter.dark.svg' },
		group: ['transform'],
		version: [1],
		subtitle: '={{$parameter.model.value}}',
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
				const models = await getList<LowRouterModel>(this, '/models');
				const showAll = this.getCurrentNodeParameter('showAllModels') === true;
				return { results: toListItems(models, { showAll, filter }) };
			},
		},
		loadOptions: {
			async getRegions(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const modelId = this.getCurrentNodeParameter('model', { extractValue: true });
				if (typeof modelId !== 'string' || !modelId) return toRegionOptions([], []);
				const [models, jurisdictions] = await Promise.all([
					getList<LowRouterModel>(this, '/models'),
					getList<Jurisdiction>(this, '/jurisdictions'),
				]);
				return toRegionOptions(scopesFor(models, modelId), jurisdictions);
			},
		},
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const credentials = await this.getCredentials('lowRouterApi');
		const baseModel = this.getNodeParameter('model', itemIndex, '', {
			extractValue: true,
		}) as string;
		const region = this.getNodeParameter('region', itemIndex, '') as string;
		const options = this.getNodeParameter('options', itemIndex, {}) as ModelOptions;
		const model = withRegion(baseModel, region);

		const useResponsesApi = prefersResponsesApi(await getEndpoints(this, model));
		let additionalParams: Record<string, unknown> | undefined;
		if (options.reasoningEffort) {
			// ChatOpenAI only forwards `reasoning` for model names it recognises as
			// OpenAI reasoning models, which LowRouter IDs never are.
			additionalParams = useResponsesApi
				? { reasoning: { effort: options.reasoningEffort } }
				: { reasoning_effort: options.reasoningEffort };
		}

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
