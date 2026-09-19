import { createHash, timingSafeEqual } from "node:crypto";

export interface GatewayConfig {
  port: number;
  nodeEnv: string;
  anthropicApiKey?: string;
  perplexityApiKey?: string;
  xaiApiKey?: string;
  accessToken: string;
  accessTokenSource: "explicit" | "perplexity" | "anthropic" | "xai" | "development";
  claudeModel: string;
  perplexityClaudeModel: string;
  grokModel: string;
  perplexityGrokModel: string;
  maxPromptChars: number;
  maxOutputTokens: number;
  upstreamTimeoutMs: number;
  maxRequestsPerMinute: number;
}

const clean = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const numberFromEnv = (
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Invalid numeric configuration value: ${value}`);
  }
  return parsed;
};

export const deriveAccessToken = (seed: string): string =>
  createHash("sha256")
    .update(`yury-ai-gateway:v1:${seed}`, "utf8")
    .digest("base64url");

export const secureTokenEqual = (received: string, expected: string): boolean => {
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const anthropicApiKey = clean(env.ANTHROPIC_API_KEY);
  const perplexityApiKey = clean(env.PERPLEXITY_API_KEY);
  const xaiApiKey = clean(env.XAI_API_KEY);
  const explicitToken = clean(env.MCP_ACCESS_TOKEN);
  const nodeEnv = clean(env.NODE_ENV) ?? "development";

  let accessToken: string;
  let accessTokenSource: GatewayConfig["accessTokenSource"];

  if (explicitToken) {
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(explicitToken)) {
      throw new Error(
        "MCP_ACCESS_TOKEN must be 32-128 URL-safe characters (letters, numbers, _ or -).",
      );
    }
    accessToken = explicitToken;
    accessTokenSource = "explicit";
  } else if (perplexityApiKey) {
    accessToken = deriveAccessToken(perplexityApiKey);
    accessTokenSource = "perplexity";
  } else if (anthropicApiKey) {
    accessToken = deriveAccessToken(anthropicApiKey);
    accessTokenSource = "anthropic";
  } else if (xaiApiKey) {
    accessToken = deriveAccessToken(xaiApiKey);
    accessTokenSource = "xai";
  } else if (nodeEnv === "test" || env.ALLOW_INSECURE_DEV === "true") {
    accessToken = explicitToken ?? "development-token-change-me-1234567890";
    accessTokenSource = "development";
  } else {
    throw new Error(
      "Configure PERPLEXITY_API_KEY, ANTHROPIC_API_KEY, XAI_API_KEY, or MCP_ACCESS_TOKEN.",
    );
  }

  return {
    port: numberFromEnv(env.PORT, 3000, 1, 65535),
    nodeEnv,
    ...(anthropicApiKey ? { anthropicApiKey } : {}),
    ...(perplexityApiKey ? { perplexityApiKey } : {}),
    ...(xaiApiKey ? { xaiApiKey } : {}),
    accessToken,
    accessTokenSource,
    claudeModel: clean(env.CLAUDE_MODEL) ?? "claude-opus-5",
    perplexityClaudeModel:
      clean(env.PERPLEXITY_CLAUDE_MODEL) ?? "anthropic/claude-opus-5",
    grokModel: clean(env.GROK_MODEL) ?? "grok-4.6",
    perplexityGrokModel: clean(env.PERPLEXITY_GROK_MODEL) ?? "xai/grok-4.6",
    maxPromptChars: numberFromEnv(env.MAX_PROMPT_CHARS, 120_000, 1_000, 1_000_000),
    maxOutputTokens: numberFromEnv(env.MAX_OUTPUT_TOKENS, 8_000, 500, 128_000),
    upstreamTimeoutMs: numberFromEnv(
      env.UPSTREAM_TIMEOUT_MS,
      240_000,
      10_000,
      900_000,
    ),
    maxRequestsPerMinute: numberFromEnv(
      env.MAX_REQUESTS_PER_MINUTE,
      60,
      1,
      1_000,
    ),
  };
}
