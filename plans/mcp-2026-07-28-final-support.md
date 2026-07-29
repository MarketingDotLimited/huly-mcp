# MCP 2026-07-28 final support plan

Date: 2026-07-29

Research: [MCP 2026-07-28 support research](../docs/research/mcp-2026-07-28-support.md)

## Decision

Adopt the final `2026-07-28` protocol while retaining MCP `2025-06-18`
compatibility for deployed clients such as the current Codex release.

Use only the stable TypeScript SDK v2 serving entries for both eras:

- HTTP: `createMcpHandler(factory, { legacy: "stateless" })`
- stdio: `serveStdio(factory, { legacy: "serve" })`

Delete the repository's hand-written draft protocol boundary instead of updating its
wire details one-by-one. The official SDK must own discovery, version negotiation,
reserved metadata, result discrimination, header validation, cache fields, MRTR
plumbing, and subscriptions.

## Tracker status

No open or closed issue in `dearlordylord/huly-mcp` is dedicated to final
`2026-07-28` conformance. PR
[#78](https://github.com/dearlordylord/huly-mcp/pull/78) added the draft-era HTTP
implementation; issue
[#171](https://github.com/dearlordylord/huly-mcp/issues/171) only hardened routing
between that draft path and legacy requests.

The user explicitly advanced the work directly from research and planning to
implementation, so no tracker mutation was authorized. The SDK migration,
dual-era serving, and removal of the draft dispatcher remain one tracer bullet:
splitting them would leave an unsupported intermediate transport architecture.

## Scope

### In scope

- Stable SDK v2 package migration.
- Final `2026-07-28` over HTTP and stdio.
- SDK-owned MCP `2025-06-18` compatibility over HTTP and stdio.
- One shared, request-aware Huly server factory.
- Preservation of bearer-token gating, Host/Origin protection, per-request
  `x-huly-*` configuration, telemetry, request cleanup, and graceful shutdown.
- Final-spec black-box tests and required local-Huly integration.
- Documentation, manual examples, package metadata, and a release changeset.

### Out of scope

- Adding a Huly product flow that actively uses MRTR. The SDK plumbing will support it,
  but no current tool requires elicitation, sampling, or roots.
- Adopting Tasks, MCP Apps, or other extensions.
- Implementing MCP OAuth. The existing fixed bearer-token gate remains an
  application-level guard in front of the MCP handler.
- Public/shared caching. Tool exposure and Huly resources can vary by request.

## Implementation sequence

### 1. Lock the final wire contract in black-box tests

Before changing dependencies, add fixtures that express the target rather than the
draft implementation:

- `server/discover` succeeds without `initialize`.
- A request without the final per-request envelope is routed to the SDK-owned
  legacy path.
- An MCP `2025-06-18` `initialize` request succeeds on both HTTP and stdio.
- A released legacy client can initialize and call `tools/list`; the spawned
  stdio test covers the built command used by Codex.
- Missing/mismatched `MCP-Protocol-Version`, `Mcp-Method`, and applicable `Mcp-Name`
  headers produce the final `-32020` error.
- Unsupported versions produce `-32022`.
- Missing `clientInfo` is accepted; malformed supplied `clientInfo` is rejected.
- Every successful response carries final wire `resultType` and
  `_meta["io.modelcontextprotocol/serverInfo"]`.
- Discovery and cacheable resource/list results carry `ttlMs` and `cacheScope`.
- Tool order remains deterministic.
- Bearer auth and request-specific Huly headers still select the intended workspace and
  tool exposure.

Drive modern HTTP in process through the v2 handler's fetch face or through the mounted
Express endpoint. Drive both modern and legacy stdio clients against the built command.

### 2. Migrate from SDK v1 to stable v2

- Run the official `@modelcontextprotocol/codemod` from the repository root, then
  review every edit.
- Replace `@modelcontextprotocol/sdk` with the split packages actually imported:
  `@modelcontextprotocol/server`, `@modelcontextprotocol/core`,
  `@modelcontextprotocol/node`, and `@modelcontextprotocol/express`. Add
  `@modelcontextprotocol/client` only if black-box tests use the official client.
- Declare `express` directly because the v2 adapter exposes it as a peer dependency.
- Confirm the supported Node floor explicitly in package metadata; SDK v2 requires
  Node 20+, while current CI/package smoke already exercises newer Node releases.
- Search for `@mcp-codemod-error`, old SDK imports, schema-first
  `setRequestHandler`, `McpError`, `ErrorCode`, old transports, and v1-only test
  fakes. The dry run currently reports 70 changes across 21 files and five
  error-enum review warnings.
- Remove the v1 exact-optional `Transport` cast once the v1 transport is gone.

### 3. Make one request-aware server factory

- Keep Huly operations and protocol-neutral response mapping in the functional core.
- Build a fresh v2 `Server`/`McpServer` for each HTTP request and one pinned instance
  for the selected stdio connection.
- Register handlers through v2 method-string APIs and pass the handler context into
  project code where request identity is needed.
- Read modern client identity from the SDK's parsed request envelope/context. Do not
  parse reserved `_meta` keys independently in the application.
- Preserve LLM-first tool mode selection when `clientInfo` is absent by treating it as
  unknown, not invalid.
- Configure conservative cache hints (`ttlMs: 0`, `cacheScope: "private"`) initially.
  Nonzero private caching can follow after cache keys and invalidation are proven;
  public caching is unsafe for caller-sensitive catalogs.

### 4. Replace both transport shells

#### HTTP

- Replace the v1 `StreamableHTTPServerTransport` plus the custom draft dispatcher with
  one `createMcpHandler(factory, { legacy: "stateless" })`.
- Adapt it once with `toNodeHandler`, mounted behind `createMcpExpressApp`.
- Keep fixed bearer-token verification in middleware before the MCP handler.
- Convert web-standard `Headers` to a schema-parsed Huly header record at the boundary.
  Preserve all-or-nothing `x-huly-*` validation and secret redaction.
- Replace Express-request-keyed client cleanup with an explicit per-request resource
  owner tied to the v2 server instance's close lifecycle. Normal completion, abort,
  handler shutdown, and failures must all release scoped Huly clients exactly once.
- Retain the handler handle so Effect shutdown can call `handler.close()`.

#### stdio

- Replace direct `Server.connect(new StdioServerTransport())` with
  `serveStdio(factory, { legacy: "serve" })`.
- Retain the returned handle for Effect-managed shutdown.
- Preserve stderr-only logging, auto-exit behavior, in-flight tool draining, and
  telemetry shutdown ordering.

### 5. Delete the draft protocol implementation

Remove:

- `src/mcp/http-2026-boundary.ts`
- `src/mcp/http-2026-dispatcher.ts`
- the project-owned `serverDiscover` result schema and handler
- manual `resultType`, cache-field, server identity, header, and modern error shaping
- legacy/draft dispatcher selection and its environment/test switch

Do not recreate SDK wire schemas in Effect Schema. Effect Schema continues to own Huly
configuration, tool input/output, and other project boundaries; the official SDK owns
the MCP wire boundary.

### 6. Update tests, integration harness, and docs

- Keep the full integration harness on the final `2026-07-28` request shape and
  cover `2025-06-18` compatibility in focused black-box transport tests.
- Rewrite stdio and manual smoke examples to start with `server/discover`.
- Replace draft-code unit tests with mounted-handler contract tests. Keep focused
  project tests for Huly config headers, auth, tool exposure, resource mapping,
  telemetry, cleanup, and lifecycle.
- Add an MRTR plumbing test with a test-only v2 server handler if it can be expressed
  without adding production behavior.
- Run the released SDK v2 client pinned to `2026-07-28` against HTTP and stdio.
- Evaluate `@modelcontextprotocol/conformance@0.2.0-alpha` as a one-time verification
  lane; do not add an alpha conformance runner to `check-all`.
- Update README, `INTEGRATION_TESTING.md`, generated/manual setup examples, and package
  metadata to state that clients must support MCP `2026-07-28`.
- Add a changeset that calls out final-protocol support and retained
  `2025-06-18` compatibility.

## Verification

1. `pnpm check-all`
2. HTTP black-box final-protocol suite
3. Spawned stdio final-protocol suite
4. Package smoke on supported Node versions
5. Local-Huly full integration from the container:

   ```bash
   pnpm build
   set -a && source .env.local && set +a
   HULY_URL="${HULY_URL/localhost/host.docker.internal}" bash scripts/integration_test_full.sh
   ```

6. A manual malformed-request pass for final header codes and legacy negotiation

## Acceptance criteria

- `@modelcontextprotocol/sdk` and all v1 transport code are absent.
- Both HTTP and stdio serve `2026-07-28` through stable SDK v2 entrypoints.
- Both transports serve MCP `2025-06-18` initialization and tool discovery through
  SDK-owned compatibility paths.
- The custom draft dispatcher and its wire schemas are deleted.
- Final discovery, response metadata, result discrimination, cache fields, header
  validation, error codes, and subscriptions are SDK-owned.
- Requests without `clientInfo` work; caller-aware tool exposure still works when it is
  present.
- Bearer auth, Host/Origin protection, Huly header isolation, scoped-client cleanup,
  telemetry drain, and graceful shutdown have regression coverage.
- `pnpm check-all`, package smoke, final-protocol black-box tests, and full local-Huly
  integration pass.

## Main implementation risk

The protocol mechanics are now low risk because SDK v2 owns them. The highest-risk
project-specific seam is HTTP request resource lifetime: today scoped Huly clients are
closed from Express request events, while v2 converts the request to a web-standard
request and owns the per-request server lifecycle. Make that ownership explicit and
test normal completion as well as abort paths; otherwise the migration can be
wire-correct while leaking Huly connections.
