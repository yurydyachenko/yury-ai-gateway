import type { GatewayConfig } from "./config.js";

const escapeHtml = (value: string): string =>
  value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });

const safeJson = (value: string): string =>
  JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");

export function setupPage(config: GatewayConfig, origin: string, nonce: string): string {
  const source = config.accessTokenSource;
  const sourceLabel =
    source === "explicit"
      ? "MCP access token"
      : source === "perplexity"
        ? "Perplexity API key"
        : source === "anthropic"
          ? "Anthropic API key"
          : source === "xai"
            ? "xAI API key"
            : "development token";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Yury AI Gateway Setup</title>
  <style nonce="${escapeHtml(nonce)}">
    :root{color-scheme:dark;--bg:#0b0f14;--panel:#121923;--line:#263244;--text:#eef4ff;--muted:#9db0c8;--accent:#57d39b;--warn:#ffcc66}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 10% 0,#152033 0,var(--bg) 38%);color:var(--text);font:16px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}
    main{max-width:780px;margin:0 auto;padding:48px 20px 80px}.badge{display:inline-block;border:1px solid #2b8b69;color:#82e6b8;border-radius:999px;padding:4px 10px;font-size:13px}
    h1{font-size:clamp(32px,6vw,58px);line-height:1.02;margin:18px 0 12px;letter-spacing:-.04em}p{color:var(--muted)}
    .card{background:color-mix(in srgb,var(--panel) 94%,transparent);border:1px solid var(--line);border-radius:18px;padding:22px;margin-top:20px;box-shadow:0 18px 60px #0005}
    label{display:block;font-weight:700;margin-bottom:8px}input{width:100%;background:#091018;border:1px solid #34445b;color:var(--text);border-radius:10px;padding:13px;font:inherit}
    button{margin-top:12px;background:var(--accent);border:0;color:#062116;font-weight:800;border-radius:10px;padding:12px 16px;font:inherit;cursor:pointer}button.secondary{background:#233146;color:var(--text);margin-left:8px}
    code{display:block;overflow-wrap:anywhere;background:#081018;border:1px solid var(--line);padding:12px;border-radius:10px;color:#bcebd8;margin-top:10px}.small{font-size:13px}.warning{color:var(--warn)}ol{padding-left:22px}a{color:#7db8ff}
  </style>
</head>
<body><main>
  <span class="badge">Gateway online</span>
  <h1>Your AI command center is ready.</h1>
  <p>This private MCP gateway connects ChatGPT to Claude, Perplexity, and Grok. It stores no prompts or model outputs.</p>

  <section class="card">
    <h2>1. Build your private connection URL</h2>
    <p>Paste your ${escapeHtml(sourceLabel)} below. It is processed only inside this browser and is never sent to the server.</p>
    <label for="secret">${escapeHtml(sourceLabel)}</label>
    <input id="secret" type="password" autocomplete="off" spellcheck="false" placeholder="Paste secret here">
    <button id="build">Build connection URL</button>
    <button id="copy" class="secondary" disabled>Copy URL</button>
    <code id="result">Your URL will appear here.</code>
    <p class="small warning">Anyone with this URL can spend against your configured model APIs. Treat it like a password. Rotate the source key if it leaks.</p>
  </section>

  <section class="card">
    <h2>2. Add it to ChatGPT</h2>
    <ol>
      <li>Open ChatGPT Settings → Security and login → enable Developer mode.</li>
      <li>Open ChatGPT Plugins, press +, and choose a public MCP connection.</li>
      <li>Name it <strong>Yury AI Gateway</strong> and paste the URL above.</li>
      <li>Review the five read-only tools, create the connection, then ask: <em>“Check my AI gateway status.”</em></li>
    </ol>
    <p class="small">The endpoint uses MCP Streamable HTTP. API keys remain in your host's encrypted environment settings.</p>
  </section>

  <section class="card">
    <h2>3. Optional direct-provider upgrades</h2>
    <p>A Perplexity key alone can route Claude and Grok reasoning. Add an Anthropic key for direct Claude calls. Add an xAI key for direct Grok calls and native X search.</p>
  </section>
</main>
<script nonce="${escapeHtml(nonce)}">
  const source = ${safeJson(source)};
  const origin = ${safeJson(origin)};
  const input = document.getElementById('secret');
  const result = document.getElementById('result');
  const copy = document.getElementById('copy');
  async function derive(secret) {
    if (source === 'explicit' || source === 'development') return secret;
    const bytes = new TextEncoder().encode('yury-ai-gateway:v1:' + secret);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return btoa(String.fromCharCode(...digest)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  }
  document.getElementById('build').addEventListener('click', async () => {
    const secret = input.value.trim();
    if (!secret) { result.textContent = 'Enter the secret first.'; return; }
    const token = await derive(secret);
    const url = origin + '/mcp/' + encodeURIComponent(token);
    result.textContent = url;
    input.value = '';
    copy.disabled = false;
  });
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(result.textContent);
    copy.textContent = 'Copied';
    setTimeout(() => copy.textContent = 'Copy URL', 1500);
  });
</script>
</body></html>`;
}
