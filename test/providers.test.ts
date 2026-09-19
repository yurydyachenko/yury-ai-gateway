import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { askClaude } from "../src/providers/anthropic.js";
import { researchWithPerplexity } from "../src/providers/perplexity.js";
import { askGrok } from "../src/providers/xai.js";

const jsonResponse = (body: unknown, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });

const config = loadConfig({
  NODE_ENV: "test",
  ANTHROPIC_API_KEY: "anthropic-secret",
  PERPLEXITY_API_KEY: "pplx-secret",
  XAI_API_KEY: "xai-secret",
  MCP_ACCESS_TOKEN: "abcdefghijklmnopqrstuvwxyz_1234567890-ABCDE",
});

describe("provider adapters", () => {
  it("calls Claude directly without leaking its API key into the body", async () => {
    const mockFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(JSON.stringify(body)).not.toContain("anthropic-secret");
      expect(body.model).toBe("claude-opus-5");
      return jsonResponse({
        id: "msg_1",
        model: "claude-opus-5",
        content: [{ type: "text", text: "Independent Claude answer" }],
        usage: { input_tokens: 12, output_tokens: 8 },
      });
    });

    const result = await askClaude(config, mockFetch as typeof fetch, {
      question: "Review this",
      mode: "red_team",
    });
    expect(result.route).toBe("direct");
    expect(result.answer).toBe("Independent Claude answer");
  });

  it("parses Perplexity answer, sources, and exact cost usage", async () => {
    const mockFetch = vi.fn(async () =>
      jsonResponse({
        id: "resp_1",
        model: "research-model",
        output: [
          {
            type: "search_results",
            results: [{ title: "Primary source", url: "https://example.com/source", date: "2026-09-01" }],
          },
          { type: "message", content: [{ type: "output_text", text: "Grounded result" }] },
        ],
        usage: { total_tokens: 100, cost: { total_cost: 0.02, currency: "USD" } },
      }),
    );

    const result = await researchWithPerplexity(config, mockFetch as typeof fetch, {
      query: "Current fact",
      depth: "high",
    });
    expect(result.answer).toBe("Grounded result");
    expect(result.sources[0]?.url).toBe("https://example.com/source");
    expect(result.usage?.cost).toEqual({ total_cost: 0.02, currency: "USD" });
  });

  it("enables native X search only on the direct xAI route", async () => {
    const mockFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { tools?: Array<Record<string, unknown>> };
      expect(body.tools).toContainEqual({
        type: "x_search",
        from_date: "2026-09-01",
        allowed_x_handles: ["xai"],
      });
      return jsonResponse({
        id: "resp_x",
        model: "grok-4.6",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: "X signal analysis",
                annotations: [{ url: "https://x.com/xai/status/1", title: "Original post" }],
              },
            ],
          },
        ],
        usage: { total_tokens: 50 },
      });
    });

    const result = await askGrok(config, mockFetch as typeof fetch, {
      question: "What is X saying?",
      sources: "x",
      effort: "high",
      fromDate: "2026-09-01",
      allowedXHandles: ["xai"],
    });
    expect(result.answer).toBe("X signal analysis");
    expect(result.sources[0]?.url).toBe("https://x.com/xai/status/1");
  });

  it("falls back to Claude through Perplexity with one API key", async () => {
    const fallbackConfig = loadConfig({
      NODE_ENV: "test",
      PERPLEXITY_API_KEY: "pplx-only",
      MCP_ACCESS_TOKEN: "abcdefghijklmnopqrstuvwxyz_1234567890-ABCDE",
    });
    const mockFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.model).toBe("anthropic/claude-opus-5");
      expect(body.tools).toEqual([]);
      return jsonResponse({
        model: "anthropic/claude-opus-5",
        output: [{ type: "message", content: [{ type: "output_text", text: "Routed Claude answer" }] }],
      });
    });

    const result = await askClaude(fallbackConfig, mockFetch as typeof fetch, {
      question: "Review this",
      mode: "independent",
    });
    expect(result.provider).toBe("anthropic");
    expect(result.route).toBe("perplexity-router");
  });
});
