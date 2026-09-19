import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Server } from "node:http";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const token = "abcdefghijklmnopqrstuvwxyz_1234567890-ABCDE";
const config = loadConfig({
  NODE_ENV: "test",
  MCP_ACCESS_TOKEN: token,
  PERPLEXITY_API_KEY: "pplx-test",
});

let liveServer: Server | undefined;
afterEach(async () => {
  if (liveServer) {
    await new Promise<void>((resolve) => liveServer?.close(() => resolve()));
    liveServer = undefined;
  }
});

describe("HTTP and MCP surface", () => {
  it("hides invalid capability URLs", async () => {
    const app = createApp(config);
    await request(app).post("/mcp/wrong-token").send({ jsonrpc: "2.0", id: 1, method: "initialize" }).expect(404);
  });

  it("serves a no-store setup page and health check", async () => {
    const app = createApp(config);
    const page = await request(app).get("/").expect(200);
    expect(page.headers["cache-control"]).toBe("no-store");
    expect(page.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(page.text).toContain("Your AI command center is ready");
    await request(app).get("/healthz").expect(200, {
      status: "ok",
      service: "yury-ai-gateway",
      version: "1.0.0",
    });
  });

  it("rejects authenticated traffic beyond the configured cost guard", async () => {
    const limited = createApp({ ...config, maxRequestsPerMinute: 1 });
    await request(limited)
      .post(`/mcp/${token}`)
      .send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    const blocked = await request(limited)
      .post(`/mcp/${token}`)
      .send({ jsonrpc: "2.0", id: 2, method: "initialize", params: {} })
      .expect(429);
    expect(blocked.headers["retry-after"]).toBe("60");
  });

  it("initializes over Streamable HTTP and exposes five read-only tools", async () => {
    const app = createApp(config);
    liveServer = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => liveServer?.once("listening", resolve));
    const address = liveServer.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP server address");

    const client = new Client({ name: "gateway-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${address.port}/mcp/${token}`),
    );
    await client.connect(transport);
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual(
      ["analyze_with_grok", "ask_claude", "gateway_status", "multi_model_panel", "research_perplexity"].sort(),
    );
    const status = await client.callTool({ name: "gateway_status", arguments: {} });
    expect(status.isError).not.toBe(true);
    await client.close();
  });
});
