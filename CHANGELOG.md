# Changelog

## 0.1.1

- The package is now `@lowrouter/n8n-nodes-lowrouter`, owned by the `lowrouter` npm organization. The unscoped `n8n-nodes-lowrouter` is deprecated and gets no further releases. Install the new name from **Settings > Community nodes**. n8n derives the node type from the package name, so the node type is now `@lowrouter/n8n-nodes-lowrouter.lmChatLowRouter`: workflows built on `n8n-nodes-lowrouter` 0.1.0 need the LowRouter Chat Model node re-added. Credentials carry over.
- Fix the canvas subtitle, which read `undefined`. It now shows the region first and drops the `auto/` prefix, such as `eu · mistralai/mistral-small-2603`, so the region survives n8n's truncation.
- The model list shows plain model IDs. n8n never displayed the per-model price, carbon and context descriptions, so they are gone and the README no longer promises them.

## 0.1.0

First release.

- LowRouter Chat Model sub-node built on `@n8n/ai-node-sdk`.
- LowRouter API credential, tested against `GET /v1/key`.
- Model list filtered to active `auto/` chat models with tool calling, with an option to show every model.
- Region option that adds a jurisdiction scope, read per model from the LowRouter catalogue.
- Temperature, maximum tokens and reasoning effort options.
