# Production acceptance — `0.50.0-mdl.16`

Date: 2026-09-02

Endpoint: `https://os-mcp.marketing.limited/mcp`

## Result

The deployed OS MCP passed live production acceptance for the search_tools semantic regression fix.
Exact-looking queries without whitespace now enforce strict matching of all query tokens against the tool metadata, returning zero results for synthetic unknown identifiers like `MCP_QA_NONEXISTENT_TARGET`, while natural multi-token searches and partial exact terms continue to work deterministically.

## Runtime contract

The gateway startup probe returned:

```text
Verified native MCP tool contract (10 tools)
```

The deployed `tools/list` response contained exactly 10 tools, unchanged from mdl.15.

## Search Regression Testing

- `search_tools` with `query: "MCP_QA_NONEXISTENT_TARGET"` correctly returns 0 matches.
- `search_tools` with natural queries returns expected results.

## Cleanup

- No synthetic TSK residue was left behind.
- No MDL or RAB mutations occurred.
