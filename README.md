# Yury AI Gateway

A private, read-only way for ChatGPT to call Claude, Perplexity, and Grok as
specialist external models.

## Recommended: no-hosting ChatGPT Action

[**Open the setup page**](https://yurydyachenko.github.io/yury-ai-gateway/)

The `gpt-action` package replaces Render. ChatGPT calls the Perplexity Agent API
directly, so there is no gateway server, hosting account, or deployment card.
GitHub hosts only the public OpenAPI schema, instructions, and setup page; it
never receives the API key.

The one unavoidable private step is entering the Perplexity key in the GPT
editor under **Actions → Authentication → API Key → Bearer**. OpenAI stores an
encrypted version of action API keys. Never put the key in GitHub or chat.

See [`gpt-action/SETUP.md`](gpt-action/SETUP.md) for the short setup, or import
the schema directly from:

`https://yurydyachenko.github.io/yury-ai-gateway/openapi.yaml`

This removes hosting charges, not model charges. Perplexity Agent API calls,
including routed Claude and Grok calls, are usage-metered by Perplexity. A truly
zero-inference-cost solution would require a local open-source model and would
not provide the same proprietary models or live Perplexity research.

## Optional: self-hosted MCP gateway

The Node application in this repository remains available if you later need an
MCP server, direct Anthropic/xAI keys, native X search, or server-side rate
limits. It can run locally or on infrastructure you already control.

## What it exposes

- `ask_claude` — blind second opinion, red team, document review, or code review.
- `research_perplexity` — source-grounded current web research.
- `analyze_with_grok` — Grok reasoning with optional web and native X search.
- `multi_model_panel` — blinded parallel review by all available models.
- `gateway_status` — free configuration/connection check.

The gateway is read-only. It does not persist prompts or outputs. Provider API
keys stay in hosting secrets and are never returned to ChatGPT.

## Local verification

```bash
cp .env.example .env
# Add at least one API key or a 32+ character MCP_ACCESS_TOKEN.
npm install
npm run check
npm run build
npm start
```

Open `http://localhost:3000`, generate the private MCP URL, and test it with MCP
Inspector or ChatGPT Developer mode.

## Security model

ChatGPT does not support presenting an arbitrary customer API key to an MCP
server. This single-user version therefore uses a high-entropy capability URL.
If `MCP_ACCESS_TOKEN` is not configured, the token is derived one-way from the
first provider key in this order: Perplexity, Anthropic, xAI.

Treat the full MCP URL like a password. Anyone who has it can invoke paid API
calls. Rotate the source provider key or set a new `MCP_ACCESS_TOKEN` if the URL
leaks. For a shared/team deployment, replace capability-URL access with OAuth
2.1 and per-user authorization.

## Cost controls

- Calls are opt-in tools; normal ChatGPT questions do not automatically call all
  providers.
- Prompts are capped at `MAX_PROMPT_CHARS` (default 120,000 characters).
- Output is capped at `MAX_OUTPUT_TOKENS` (default 8,000 per provider call).
- `multi_model_panel` makes up to three paid model calls in parallel.
- The gateway accepts at most `MAX_REQUESTS_PER_MINUTE` authenticated MCP HTTP
  requests per minute (default 60).
- Perplexity returns its exact API cost data when supplied by the API.

## Privacy

Only the question and context passed to a selected tool are sent to that
provider. Do not send credentials, unnecessary personal information,
attorney-client material, regulated data, or confidential company documents
without confirming that the relevant provider terms and your company policy
permit it.
