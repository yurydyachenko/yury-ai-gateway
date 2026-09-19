import { describe, expect, it } from "vitest";
import { deriveAccessToken, loadConfig, secureTokenEqual } from "../src/config.js";

describe("configuration", () => {
  it("derives a stable URL-safe access token", () => {
    const token = deriveAccessToken("pplx-test-key");
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).toBe(deriveAccessToken("pplx-test-key"));
  });

  it("prefers explicit access tokens", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      PERPLEXITY_API_KEY: "pplx-test",
      MCP_ACCESS_TOKEN: "abcdefghijklmnopqrstuvwxyz_1234567890-ABCDE",
    });
    expect(config.accessTokenSource).toBe("explicit");
    expect(config.accessToken).toBe("abcdefghijklmnopqrstuvwxyz_1234567890-ABCDE");
  });

  it("compares tokens without accepting length mismatches", () => {
    expect(secureTokenEqual("same-token", "same-token")).toBe(true);
    expect(secureTokenEqual("same", "different")).toBe(false);
  });
});
