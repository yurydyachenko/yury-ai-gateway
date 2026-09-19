# No-hosting setup

This is the replacement for Render. ChatGPT calls the Perplexity Agent API
directly, so there is no web server, hosting account, or payment card for
deployment.

1. Open the [GPT editor](https://chatgpt.com/gpts/editor) and create a GPT named
   **Yury AI Panel**.
2. Copy [`INSTRUCTIONS.md`](./INSTRUCTIONS.md) into the GPT's Instructions box.
3. Under **Actions**, choose **Import from URL** and use:

   `https://raw.githubusercontent.com/yurydyachenko/yury-ai-gateway/main/gpt-action/openapi.yaml`

4. Open the action's **Authentication** settings:
   - Authentication: **API Key**
   - Auth type: **Bearer**
   - API key: paste the Perplexity key in that secure field
5. Test with: `Research today's most important AI news with Perplexity.`
6. On the first action call, choose **Always allow** if you want future explicit
   requests to run without another approval click.
7. Save the GPT as **Only me** unless you intentionally want to share access to
   an action that can consume your API credits.

Never put the key in GitHub, the OpenAPI schema, GPT instructions, or a chat
message. OpenAI says action API keys entered in the GPT editor are encrypted at
rest.

## Cost boundary

This setup has no Render or other hosting charge. GitHub stores only the public
configuration files. Perplexity API calls, including routed Claude and Grok
calls, are usage-metered by Perplexity and are not made free by this setup.

If you require zero inference cost as well as zero hosting cost, proprietary
Perplexity, Claude, and Grok APIs cannot meet that requirement. Use a local
open-source model instead; it will not provide the same provider models or live
Perplexity research.
