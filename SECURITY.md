# Security

Do not commit API keys, MCP URLs, or access tokens. Store provider keys only in
the deployment platform's encrypted environment settings.

The full `/mcp/<token>` URL is a bearer credential. If it is disclosed, rotate
the provider key used to derive it or set a new random `MCP_ACCESS_TOKEN`, then
update the ChatGPT connection.

Report vulnerabilities privately to the repository owner. Do not open a public
issue containing credentials or an exploitable private endpoint.
