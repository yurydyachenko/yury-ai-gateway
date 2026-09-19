# Yury AI Gateway

A private, read-only MCP gateway that lets ChatGPT selectively call Claude,
Perplexity, and Grok as specialist external models.

## What it exposes

- `ask_claude` — blind second opinion, red team, document review, or code review.
- `research_perplexity` — source-grounded current web research.
- `analyze_with_grok` — Grok reasoning with optional web and native X search.
- `multi_model_panel` — blinded parallel review by all available models.
- `gateway_status` — free configuration/connection check.

The gateway is read-only. It does not persist prompts or outputs. Provider API
keys stay in hosting secrets and are never returned to ChatGPT.

## Fastest deployment

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/yurydyachenko/yury-ai-gateway)

Click the button above for a one-click Render Blueprint deployment. The only
required secret is `PERPLEXITY_API_KEY`.

A Perplexity key enables Perplexity research and can route Claude and Grok
reasoning. Add `ANTHROPIC_API_KEY` later for direct Claude calls. Add
`XAI_API_KEY` for direct Grok calls and native X search.

After deployment, open the service URL. Its setup page derives your private MCP
connection URL locally in the browser and walks you through adding it to
ChatGPT.

The Blueprint starts on Render's free plan so deployment does not silently
create a paid service. Free services sleep after inactivity, so open the service
URL first to wake it before connecting from ChatGPT. Upgrade the Render instance
if you want an always-on gateway.

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
