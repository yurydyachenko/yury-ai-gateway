import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GatewayConfig } from "./config.js";
import { askClaude } from "./providers/anthropic.js";
import { researchWithPerplexity } from "./providers/perplexity.js";
import { askGrok } from "./providers/xai.js";
import { ProviderError, type FetchLike, type GatewayResult, type ProviderFailure } from "./types.js";

const VERSION = "1.0.0";
const readOnlyOpenWorld = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true,
};

const truncate = (text: string, limit = 100_000): string =>
  text.length <= limit ? text : `${text.slice(0, limit)}\n\n[truncated by gateway]`;

const resultText = (result: GatewayResult): string => {
  const sources = result.sources.length
    ? `\n\nSources:\n${result.sources
        .slice(0, 30)
        .map((source, index) => `${index + 1}. ${source.title ?? source.url} — ${source.url}`)
        .join("\n")}`
    : "";
  const warnings = result.warnings.length ? `\n\nWarnings:\n- ${result.warnings.join("\n- ")}` : "";
  return truncate(
    `[${result.provider} via ${result.route}; model ${result.model}]\n\n${result.answer}${sources}${warnings}`,
  );
};

const failureFrom = (provider: string, error: unknown): ProviderFailure => ({
  provider,
  status: error instanceof ProviderError && /not configured|requires XAI_API_KEY/i.test(error.message)
    ? "unavailable"
    : "error",
  message: error instanceof Error ? error.message : "Unknown provider error.",
});

const errorToolResult = (error: unknown) => ({
  isError: true as const,
  content: [
    {
      type: "text" as const,
      text:
        error instanceof ProviderError
          ? `${error.provider} request failed: ${error.message}`
          : error instanceof Error
            ? error.message
            : "Unexpected gateway error.",
    },
  ],
});

export function createMcpServer(config: GatewayConfig, fetchFn: FetchLike = fetch): McpServer {
  const server = new McpServer(
    { name: "yury-ai-gateway", version: VERSION },
    {
      instructions:
        "Use selectively: Claude for independent/red-team review; Perplexity for current web evidence; Grok for X/web signals; multi_model_panel for consequential decisions. Never send secrets or unnecessary personal data. Treat consensus as a signal, not proof. After panel calls, reconcile disagreements and verify material claims.",
    },
  );

  server.registerTool(
    "gateway_status",
    {
      title: "Check AI gateway status",
      description:
        "Check which external model routes are configured, without making a paid model call or exposing secrets.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => {
      const status = {
        version: VERSION,
        configured: {
          perplexity: Boolean(config.perplexityApiKey),
          anthropicDirect: Boolean(config.anthropicApiKey),
          xaiDirectAndXSearch: Boolean(config.xaiApiKey),
        },
        routes: {
          claude: config.anthropicApiKey
            ? `direct:${config.claudeModel}`
            : config.perplexityApiKey
              ? `perplexity-router:${config.perplexityClaudeModel}`
              : "unavailable",
          perplexity: config.perplexityApiKey ? "agent-api" : "unavailable",
          grok: config.xaiApiKey
            ? `direct:${config.grokModel}`
            : config.perplexityApiKey
              ? `perplexity-router:${config.perplexityGrokModel} (no native X search)`
              : "unavailable",
        },
      };
      return {
        structuredContent: status,
        content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
      };
    },
  );

  server.registerTool(
    "ask_claude",
    {
      title: "Ask Claude for an independent review",
      description:
        "Use for a blind second opinion, red-team challenge, document review, or code review. Claude does not receive ChatGPT's answer unless you explicitly include it in context. Sends only the supplied question/context to Anthropic directly or through the configured Perplexity route.",
      inputSchema: {
        question: z.string().min(3).max(config.maxPromptChars),
        context: z.string().max(config.maxPromptChars).optional(),
        mode: z
          .enum(["independent", "red_team", "document_review", "code_review"])
          .default("independent"),
        max_output_tokens: z.number().int().min(500).max(config.maxOutputTokens).optional(),
      },
      annotations: readOnlyOpenWorld,
    },
    async ({ question, context, mode, max_output_tokens }) => {
      try {
        const result = await askClaude(config, fetchFn, {
          question,
          ...(context ? { context } : {}),
          mode,
          ...(max_output_tokens ? { maxOutputTokens: max_output_tokens } : {}),
        });
        return { structuredContent: result, content: [{ type: "text", text: resultText(result) }] };
      } catch (error) {
        return errorToolResult(error);
      }
    },
  );

  server.registerTool(
    "research_perplexity",
    {
      title: "Research with Perplexity",
      description:
        "Use for current, source-grounded web research. Prioritizes primary sources and returns links, dates, conflicts, and uncertainty. Do not use merely to repeat stable knowledge already available.",
      inputSchema: {
        query: z.string().min(3).max(config.maxPromptChars),
        context: z.string().max(config.maxPromptChars).optional(),
        depth: z.enum(["fast", "low", "medium", "high", "xhigh"]).default("high"),
        max_output_tokens: z.number().int().min(500).max(config.maxOutputTokens).optional(),
      },
      annotations: readOnlyOpenWorld,
    },
    async ({ query, context, depth, max_output_tokens }) => {
      try {
        const result = await researchWithPerplexity(config, fetchFn, {
          query,
          ...(context ? { context } : {}),
          depth,
          ...(max_output_tokens ? { maxOutputTokens: max_output_tokens } : {}),
        });
        return { structuredContent: result, content: [{ type: "text", text: resultText(result) }] };
      } catch (error) {
        return errorToolResult(error);
      }
    },
  );

  server.registerTool(
    "analyze_with_grok",
    {
      title: "Analyze with Grok and live sources",
      description:
        "Use for an independent Grok analysis or for current X/web discussion. Native X search requires a direct xAI key. Treat social sentiment as a lead, not proof, and independently verify consequential claims.",
      inputSchema: {
        question: z.string().min(3).max(config.maxPromptChars),
        context: z.string().max(config.maxPromptChars).optional(),
        sources: z.enum(["none", "web", "x", "web_and_x"]).default("x"),
        effort: z.enum(["low", "medium", "high", "xhigh"]).default("high"),
        from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        allowed_x_handles: z.array(z.string().min(1).max(50)).max(20).optional(),
        excluded_x_handles: z.array(z.string().min(1).max(50)).max(20).optional(),
        max_output_tokens: z.number().int().min(500).max(config.maxOutputTokens).optional(),
      },
      annotations: readOnlyOpenWorld,
    },
    async ({
      question,
      context,
      sources,
      effort,
      from_date,
      to_date,
      allowed_x_handles,
      excluded_x_handles,
      max_output_tokens,
    }) => {
      if (allowed_x_handles?.length && excluded_x_handles?.length) {
        return errorToolResult(
          new Error("Use allowed_x_handles or excluded_x_handles, not both."),
        );
      }
      try {
        const result = await askGrok(config, fetchFn, {
          question,
          ...(context ? { context } : {}),
          sources,
          effort,
          ...(from_date ? { fromDate: from_date } : {}),
          ...(to_date ? { toDate: to_date } : {}),
          ...(allowed_x_handles ? { allowedXHandles: allowed_x_handles } : {}),
          ...(excluded_x_handles ? { excludedXHandles: excluded_x_handles } : {}),
          ...(max_output_tokens ? { maxOutputTokens: max_output_tokens } : {}),
        });
        return { structuredContent: result, content: [{ type: "text", text: resultText(result) }] };
      } catch (error) {
        return errorToolResult(error);
      }
    },
  );

  server.registerTool(
    "multi_model_panel",
    {
      title: "Run a blinded multi-model panel",
      description:
        "Use for consequential or genuinely difficult decisions. Sends the same task independently to Claude, Perplexity, and Grok without showing any model the others' answers. Returns raw views for ChatGPT to reconcile; model agreement is not evidence by itself.",
      inputSchema: {
        question: z.string().min(3).max(config.maxPromptChars),
        context: z.string().max(config.maxPromptChars).optional(),
        perplexity_depth: z.enum(["fast", "low", "medium", "high", "xhigh"]).default("high"),
        grok_sources: z.enum(["none", "web", "x", "web_and_x"]).default("web"),
        grok_effort: z.enum(["low", "medium", "high", "xhigh"]).default("high"),
        max_output_tokens_per_model: z
          .number()
          .int()
          .min(500)
          .max(config.maxOutputTokens)
          .default(Math.min(4_000, config.maxOutputTokens)),
      },
      annotations: readOnlyOpenWorld,
    },
    async ({
      question,
      context,
      perplexity_depth,
      grok_sources,
      grok_effort,
      max_output_tokens_per_model,
    }) => {
      const shared = context ? { context } : {};
      const calls = [
        {
          provider: "claude",
          promise: askClaude(config, fetchFn, {
            question,
            ...shared,
            mode: "independent",
            maxOutputTokens: max_output_tokens_per_model,
          }),
        },
        {
          provider: "perplexity",
          promise: researchWithPerplexity(config, fetchFn, {
            query: question,
            ...shared,
            depth: perplexity_depth,
            maxOutputTokens: max_output_tokens_per_model,
          }),
        },
        {
          provider: "grok",
          promise: askGrok(config, fetchFn, {
            question,
            ...shared,
            sources: grok_sources,
            effort: grok_effort,
            maxOutputTokens: max_output_tokens_per_model,
          }),
        },
      ];

      const settled = await Promise.allSettled(calls.map((call) => call.promise));
      const results: Array<GatewayResult | ProviderFailure> = settled.map((item, index) => {
        const provider = calls[index]?.provider ?? "unknown";
        return item.status === "fulfilled" ? item.value : failureFrom(provider, item.reason);
      });
      const successful = results.filter(
        (item): item is GatewayResult => "answer" in item,
      );

      if (!successful.length) {
        return {
          isError: true,
          structuredContent: { results },
          content: [{ type: "text", text: `All panel calls failed:\n${JSON.stringify(results, null, 2)}` }],
        };
      }

      const text = successful
        .map((result) => `## ${result.provider}\n${resultText(result)}`)
        .join("\n\n---\n\n");
      const failures = results.filter((item): item is ProviderFailure => !("answer" in item));
      const failureText = failures.length
        ? `\n\nPanel gaps:\n${failures.map((failure) => `- ${failure.provider}: ${failure.message}`).join("\n")}`
        : "";
      return {
        structuredContent: { blinded: true, results },
        content: [
          {
            type: "text",
            text: truncate(
              `Blinded panel outputs follow. Reconcile agreements, contradictions, evidence quality, and unsupported assumptions before answering the user.\n\n${text}${failureText}`,
              250_000,
            ),
          },
        ],
      };
    },
  );

  return server;
}
