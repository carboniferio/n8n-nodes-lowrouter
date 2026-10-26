import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
	Icon,
} from 'n8n-workflow';

export class LowRouterApi implements ICredentialType {
	name = 'lowRouterApi';

	displayName = 'LowRouter API';

	documentationUrl = 'https://lowrouter.ai/docs/getting-started/api-keys';

	icon: Icon = { light: 'file:../icons/lowrouter.svg', dark: 'file:../icons/lowrouter.dark.svg' };

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			placeholder: 'sk-lr-...',
			description:
				'Create a key on the <a href="https://lowrouter.ai/app/keys" target="_blank">LowRouter Keys page</a>',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.lowrouter.ai/v1',
			url: '/models',
		},
	};
}
