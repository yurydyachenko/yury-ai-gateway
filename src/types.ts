export type FetchLike = typeof fetch;

export type ResearchDepth = "fast" | "low" | "medium" | "high" | "xhigh";
export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";
export type GrokSources = "none" | "web" | "x" | "web_and_x";

export interface SourceLink {
  title?: string;
  url: string;
  date?: string;
  source?: string;
}

export interface GatewayResult {
  [key: string]: unknown;
  provider: "anthropic" | "perplexity" | "xai";
  route: "direct" | "perplexity-router" | "perplexity-agent";
  model: string;
  answer: string;
  sources: SourceLink[];
  usage?: Record<string, unknown>;
  warnings: string[];
  requestId?: string;
}

export interface ProviderFailure {
  provider: string;
  status: "error" | "unavailable";
  message: string;
}

export class ProviderError extends Error {
  readonly provider: string;
  readonly statusCode?: number;

  constructor(provider: string, message: string, statusCode?: number) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.statusCode = statusCode;
  }
}
