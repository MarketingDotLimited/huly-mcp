---
"@firfi/huly-mcp": patch
---

Decode deferred JSON-string `invoke_tool` arguments once at the proxy boundary, preserve malformed values for target-schema errors, and keep explicitly legacy HTTP requests on the SDK transport when they include `Mcp-Method`.
