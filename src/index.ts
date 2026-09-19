import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = createApp(config);

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`Yury AI Gateway listening on port ${config.port}`);
});

const shutdown = (signal: string) => {
  console.log(`${signal} received; shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
