---
"@firfi/huly-mcp": major
---

Replace the MCP SDK edge with Effect AI's MCP `2025-06-18` transport. This is a
breaking change: `server/discover`, MCP `2026-07-28`, stateless HTTP requests,
and SDK-specific request headers are removed. Clients must initialize each
stdio stream and use the returned `Mcp-Session-Id` plus negotiated protocol
version for subsequent HTTP requests.
