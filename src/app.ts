import express, { type Request } from "express";
import { randomBytes } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { GatewayConfig } from "./config.js";
import { secureTokenEqual } from "./config.js";
import { createMcpServer } from "./mcp.js";
import { setupPage } from "./setup-page.js";
import type { FetchLike } from "./types.js";

const originFor = (request: Request): string => {
  const forwardedProto = request.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto === "https" ? "https" : request.protocol === "https" ? "https" : "http";
  const host = request.get("host") ?? "localhost";
  if (!/^(?:[A-Za-z0-9-]+\.)*[A-Za-z0-9-]+(?::\d{1,5})?$/.test(host)) {
    return `${protocol}://localhost`;
  }
  return `${protocol}://${host}`;
};

export function createApp(config: GatewayConfig, fetchFn: FetchLike = fetch) {
  const app = express();
  let rateWindowStartedAt = Date.now();
  let requestsInWindow = 0;
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb", type: ["application/json", "application/*+json"] }));
  app.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    next();
  });

  app.get("/", (request, response) => {
    const nonce = randomBytes(18).toString("base64");
    response.setHeader(
      "Content-Security-Policy",
      `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    );
    response.type("html").send(setupPage(config, originFor(request), nonce));
  });

  app.get("/healthz", (_request, response) => {
    response.json({ status: "ok", service: "yury-ai-gateway", version: "1.0.0" });
  });

  const authorized = (request: Request): boolean => {
    const token = request.params.token;
    return typeof token === "string" && secureTokenEqual(token, config.accessToken);
  };

  const withinRateLimit = (): boolean => {
    const now = Date.now();
    if (now - rateWindowStartedAt >= 60_000) {
      rateWindowStartedAt = now;
      requestsInWindow = 0;
    }
    requestsInWindow += 1;
    return requestsInWindow <= config.maxRequestsPerMinute;
  };

  app.post("/mcp/:token", async (request, response) => {
    if (!authorized(request)) {
      response.status(404).json({ error: "Not found" });
      return;
    }
    if (!withinRateLimit()) {
      response.setHeader("Retry-After", "60");
      response.status(429).json({ error: "Gateway rate limit exceeded" });
      return;
    }

    const server = createMcpServer(config, fetchFn);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    response.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal MCP gateway error" },
          id: null,
        });
      }
      if (config.nodeEnv !== "test") {
        console.error("MCP request failed", error instanceof Error ? error.message : "unknown error");
      }
    }
  });

  app.get("/mcp/:token", (request, response) => {
    if (!authorized(request)) {
      response.status(404).json({ error: "Not found" });
      return;
    }
    response.status(405).set("Allow", "POST").send("Method not allowed");
  });

  app.delete("/mcp/:token", (request, response) => {
    if (!authorized(request)) {
      response.status(404).json({ error: "Not found" });
      return;
    }
    response.status(405).set("Allow", "POST").send("Method not allowed");
  });

  app.use((_request, response) => response.status(404).json({ error: "Not found" }));
  return app;
}
