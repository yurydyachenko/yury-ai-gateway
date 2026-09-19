import { ProviderError, type FetchLike, type SourceLink } from "../types.js";

export async function fetchJson(
  fetchFn: FetchLike,
  provider: string,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ data: Record<string, unknown>; headers: Headers }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let data: Record<string, unknown> = {};

    if (text) {
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        if (!response.ok) {
          throw new ProviderError(
            provider,
            `${provider} returned HTTP ${response.status}.`,
            response.status,
          );
        }
        throw new ProviderError(provider, `${provider} returned invalid JSON.`);
      }
    }

    if (!response.ok) {
      const message = extractErrorMessage(data) ?? `${provider} returned HTTP ${response.status}.`;
      throw new ProviderError(provider, message.slice(0, 800), response.status);
    }

    return { data, headers: response.headers };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError(provider, `${provider} timed out after ${timeoutMs} ms.`);
    }
    throw new ProviderError(
      provider,
      error instanceof Error ? error.message : `${provider} request failed.`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function extractErrorMessage(data: Record<string, unknown>): string | undefined {
  const error = data.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  const message = data.message;
  return typeof message === "string" ? message : undefined;
}

export function extractOutputText(data: Record<string, unknown>): string {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const chunks: string[] = [];
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const text = (block as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) chunks.push(text.trim());
    }
  }
  return chunks.join("\n\n").trim();
}

export function extractSources(data: unknown, limit = 40): SourceLink[] {
  const found = new Map<string, SourceLink>();

  const walk = (value: unknown): void => {
    if (found.size >= limit || value == null) return;
    if (Array.isArray(value)) {
      for (const child of value) walk(child);
      return;
    }
    if (typeof value !== "object") return;

    const object = value as Record<string, unknown>;
    if (typeof object.url === "string" && /^https?:\/\//i.test(object.url)) {
      const source: SourceLink = { url: object.url };
      if (typeof object.title === "string") source.title = object.title;
      if (typeof object.date === "string") source.date = object.date;
      if (typeof object.source === "string") source.source = object.source;
      found.set(object.url, source);
    }

    for (const child of Object.values(object)) walk(child);
  };

  walk(data);
  return [...found.values()];
}

export function clampOutputTokens(requested: number | undefined, maximum: number): number {
  if (!requested) return Math.min(4_000, maximum);
  return Math.max(500, Math.min(requested, maximum));
}

export function combineQuestionAndContext(question: string, context?: string): string {
  if (!context?.trim()) return question.trim();
  return `${question.trim()}\n\n<context_data>\n${context.trim()}\n</context_data>`;
}

export function requestIdFrom(headers: Headers, data: Record<string, unknown>): string | undefined {
  const headerId = headers.get("request-id") ?? headers.get("x-request-id");
  if (headerId) return headerId;
  return typeof data.id === "string" ? data.id : undefined;
}
