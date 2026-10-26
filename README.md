# @lowrouter/n8n-nodes-lowrouter

An n8n community node that adds **LowRouter Chat Model**, a chat model sub-node for the AI Agent and other n8n AI nodes.

[LowRouter](https://lowrouter.ai) is an OpenAI-compatible LLM gateway. It routes each request to a provider and region, taking carbon intensity, price and jurisdiction into account, and fails over when a route is down. Model IDs of the form `auto/<creator>/<model>` let LowRouter pick the route. Adding a scope such as `/eu` or `/eu-sovereign` keeps the request inside that jurisdiction.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

- [Installation](#installation)
- [Credentials](#credentials)
- [Usage](#usage)
- [Compatibility](#compatibility)
- [Development](#development)
- [Resources](#resources)

## Installation

Follow the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/). On a self-hosted instance, an owner or admin can go to **Settings > Community nodes**, choose **Install**, and enter `@lowrouter/n8n-nodes-lowrouter`.

Version 0.1.0 was published as `n8n-nodes-lowrouter`. That name is deprecated; see the [changelog](CHANGELOG.md) for moving a workflow to the new package.

## Credentials

You need a LowRouter account and an API key.

1. Sign in at [lowrouter.ai](https://lowrouter.ai) and open the [Keys page](https://lowrouter.ai/app/keys).
2. Create a key. It starts with `sk-lr-` and is shown once.
3. In n8n, create a **LowRouter API** credential and paste the key.

n8n tests the credential by calling `GET https://api.lowrouter.ai/v1/key`, which returns the key's label and remaining credit. A blank, malformed, wrong or expired key fails the test.

Your key's routing policy, set in the LowRouter dashboard, applies to every request made with it. See [API keys](https://lowrouter.ai/docs/getting-started/api-keys).

## Usage

1. Add an **AI Agent** node (or another node with a Chat Model input).
2. Click the **Chat Model** input and choose **LowRouter Chat Model**.
3. Select your LowRouter credential and a model.

### Parameters

| Parameter                              | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Show All Models**                    | Off by default. The model list then shows active `auto/<creator>/<model>` chat models that support tool calling, since an agent needs tools. Turn it on to list every ID LowRouter serves, including provider-pinned routes like `mistral/mistralai/mistral-large-2512`, scoped IDs, and models without tool calling.                                                                                                                                                                                                                                           |
| **Model**                              | Pick a model ID from the searchable list, or switch to **ID** and type any LowRouter model ID.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Region**                             | Restricts an auto-routed model to a jurisdiction by adding a scope to the model ID: `auto/mistralai/mistral-large-2512` with region `eu` is sent as `auto/mistralai/mistral-large-2512/eu`. The list shows the scopes LowRouter offers for the selected model, read from `/v1/models` and described by `/v1/jurisdictions`. Leave it on **Any** to let your routing policy decide. Country scopes such as `fr` or `de` are accepted too but not listed; set them with an expression. A region set on a pinned or already-scoped ID stops the run with an error. |
| **Options > Maximum Number of Tokens** | Caps the length of the reply.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Options > Reasoning Effort**         | Sent as `reasoning_effort` (or `reasoning.effort` when the node uses the Responses API). LowRouter translates it for each provider and uses the nearest level a model accepts. See [request parameters](https://lowrouter.ai/docs/guides/request-parameters).                                                                                                                                                                                                                                                                                                   |
| **Options > Sampling Temperature**     | Sampling temperature, 0 to 2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

The node uses the OpenAI Chat Completions API. It switches to the Responses API only for a model whose `endpoints` field in `/v1/models` lists `responses` but not `chat.completions`. LowRouter translates Responses requests onto Chat Completions, so Chat Completions is the direct path whenever a model offers it.

Streaming works when the AI Agent's **Enable Streaming** option is on and the workflow starts with a Chat Trigger or a Webhook whose response mode is **Streaming**.

### What the node does not show

n8n has no place for a sub-node to report per-call cost. Usage, cost and credits are on the LowRouter dashboard.

n8n's Agents and Chat Hub features only list providers built into n8n. To use LowRouter there, create an **OpenAI** credential with Base URL `https://api.lowrouter.ai/v1` and your LowRouter key.

## Compatibility

Requires an n8n version that supports AI node SDK packages (`aiNodeSdkVersion` 1). Tested on n8n 2.44.7.

The package has no runtime dependencies. `n8n-workflow` and `@n8n/ai-node-sdk` are peer dependencies provided by n8n.

## Development

```bash
npm install
npm run dev     # starts n8n with this node loaded, rebuilding on change
npm run lint    # n8n community node lint rules
npm test        # builds, then runs the unit tests in test/
```

### Releasing

Releases are published to npm from GitHub Actions with a provenance statement, which n8n requires for verified community nodes. The workflow is `.github/workflows/publish.yml`.

This setup happens once, after the GitHub repository exists. npm accepts a trusted publisher only for a package that already exists, so the first release uses a token:

1. Create a granular npm access token with publish rights and save it as the `NPM_TOKEN` secret in the GitHub repository.
2. Release the first version (see below).
3. On npmjs.com, open the package's **Settings > Trusted Publishers** and add GitHub Actions with repository `carboniferio/n8n-nodes-lowrouter` and workflow `publish.yml`.
4. Delete the `NPM_TOKEN` secret. Later releases authenticate through GitHub's OIDC token.

After that, run `npm run release` locally. It lints, builds, bumps the version, updates `CHANGELOG.md`, and pushes a tag. The tag push triggers the workflow, which publishes with `--provenance`.

Before submitting to the n8n Creator Portal, check the published version with `npx @n8n/scan-community-package @lowrouter/n8n-nodes-lowrouter`.

## Resources

- [LowRouter documentation](https://lowrouter.ai/docs)
- [Available models and scopes](https://lowrouter.ai/docs/models/available)
- [Routing and jurisdiction scopes](https://lowrouter.ai/docs/models/routing)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE.md)
