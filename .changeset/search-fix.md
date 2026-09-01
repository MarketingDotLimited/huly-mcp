---
"@firfi/huly-mcp": patch
"@firfi/huly-cli": patch
---

Fix search_tools to return zero irrelevant results for exact-looking synthetic queries like MCP_QA_NONEXISTENT_TARGET, by enforcing strictly matching tokens when the query contains no whitespace.
