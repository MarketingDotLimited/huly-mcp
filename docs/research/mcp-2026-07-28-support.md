# MCP 2026-07-28 support research

Date: 2026-07-29

## Recommendation

Migrate this server to the stable TypeScript SDK v2 packages and make both transports
serve final `2026-07-28` plus SDK-owned `2025-06-18` compatibility. Use
`serveStdio(factory, { legacy: "serve" })` for stdio and
`createMcpHandler(factory, { legacy: "stateless" })` for HTTP. Do not patch the
repository's hand-written 2026 HTTP dispatcher into final-spec compliance.

This is not a greenfield feature. The repository already has a draft-era implementation
of stateless 2026 HTTP in `src/mcp/http-2026-boundary.ts` and
`src/mcp/http-2026-dispatcher.ts`, while stdio still connects directly through the v1
SDK. The final specification and stable SDK now make that split both unnecessary and
incorrect in several observable details. Replacing the custom protocol layer with the
official SDK entry points gives one shared registration path and delegates
negotiation, wire codecs, headers, caching fields, discovery, subscriptions, and future
errata to the protocol owner.

Compatibility remains deliberate rather than implicit: released `2026-07-28` clients
use discovery and per-request metadata, while deployed `2025-06-18` clients such as the
current Codex release keep their initialize-era flow. The package changeset, README,
integration instructions, and release announcement must describe both paths.

The release is ready to adopt:

- The protocol revision is formally `2026-07-28`, released July 28, 2026
  ([announcement](https://blog.modelcontextprotocol.io/posts/2026-07-28/),
  [authoritative specification](https://modelcontextprotocol.io/specification/2026-07-28),
  [schema](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.ts)).
- The official TypeScript packages have stable `2.0.0` releases, including
  `@modelcontextprotocol/server`, `@modelcontextprotocol/core`,
  `@modelcontextprotocol/node`, `@modelcontextprotocol/express`, and the codemod
  ([server v2.0.0 release](https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/%40modelcontextprotocol%2Fserver%402.0.0)).
- The repository is locked to the v1 monolith, `@modelcontextprotocol/sdk@1.29.0`.
  Upgrading the package alone does **not** enable the new wire protocol: the v2 SDK
  deliberately requires use of its modern serving entry points
  ([v1-to-v2 guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/upgrade-to-v2.md),
  [2026 support guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/support-2026-07-28.md)).

## What the protocol release changed

The authoritative delta from `2025-11-25` is the specification
[changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog).
The server-relevant changes are:

1. **A stateless, self-describing core.** `initialize`,
   `notifications/initialized`, `Mcp-Session-Id`, SSE resumability, and
   `Last-Event-ID` are absent in the new era. Each request carries
   `io.modelcontextprotocol/protocolVersion` and
   `io.modelcontextprotocol/clientCapabilities` in `params._meta`;
   `io.modelcontextprotocol/clientInfo` is recommended but optional. A server returns
   `-32022` for an unsupported protocol version
   ([versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)).

2. **Mandatory server discovery.** Servers must implement `server/discover`; clients
   may use it to choose a version or as the stdio backward-compatibility probe.
   Discovery is itself cacheable and returns supported versions, capabilities,
   optional instructions, and server identity in
   `_meta["io.modelcontextprotocol/serverInfo"]`
   ([discovery](https://modelcontextprotocol.io/specification/2026-07-28/server/discover)).

3. **Result discrimination and caching.** Every successful result has
   `resultType`; ordinary results use `"complete"`. Results for `server/discover`,
   `tools/list`, `prompts/list`, `resources/list`, `resources/templates/list`, and
   `resources/read` also require `ttlMs` and `cacheScope`. Tools should be listed in a
   deterministic order
   ([caching](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching),
   [tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).

4. **Header-based HTTP routing.** Modern Streamable HTTP POST requests mirror the
   method in `Mcp-Method`; `tools/call`, `resources/read`, and `prompts/get` also
   mirror the name/URI in `Mcp-Name`. `x-mcp-header` JSON Schema annotations can mirror
   selected tool parameters into `Mcp-Param-*` headers. Values that are not safe plain
   ASCII use the specified Base64 sentinel encoding. Missing, malformed, or mismatched
   required headers return HTTP 400 with `-32020 HeaderMismatch`
   ([Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)).

5. **Multi Round-Trip Requests (MRTR).** The new era has no server-to-client JSON-RPC
   request channel. A handler needing elicitation, sampling, or roots returns
   `resultType: "input_required"`; the client retries the original request with
   `inputResponses` and optional opaque `requestState`
   ([MRTR](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr)).
   This server does not currently use those features, so MRTR is not a launch blocker.

6. **Subscriptions and removals.** `subscriptions/listen` replaces the standalone HTTP
   GET stream and resource subscribe/unsubscribe methods. `ping`,
   `logging/setLevel`, and `notifications/roots/list_changed` are removed in the new
   era. Tasks moved from experimental core into the
   `io.modelcontextprotocol/tasks` extension
   ([subscriptions](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions),
   [changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)).

7. **Deprecations with an offramp.** Roots, Sampling, Logging, HTTP+SSE, and Dynamic
   Client Registration remain available for backward compatibility but new
   implementations should not adopt them. The feature lifecycle guarantees at least a
   twelve-month deprecation window
   ([deprecated features](https://modelcontextprotocol.io/specification/2026-07-28/deprecated)).

Authorization also gained issuer validation, issuer-bound credentials, correct DCR
`application_type`, and a preference for Client ID Metadata Documents. Huly MCP's
current endpoint bearer-token gate is not an MCP OAuth client or authorization server,
so those OAuth migration items are not on the critical path. The HTTP bearer gate must
still be preserved in front of the new SDK handler.

## What SDK v2 owns

The v2 monolith split is material:

| v1 | v2 responsibility |
| --- | --- |
| `@modelcontextprotocol/sdk/server/*` | `@modelcontextprotocol/server` and `@modelcontextprotocol/server/stdio` |
| v1 Node Streamable HTTP and Express helpers | `@modelcontextprotocol/node` plus `@modelcontextprotocol/express` |
| public wire schemas | `@modelcontextprotocol/core` |
| `McpError`, `ErrorCode` | `ProtocolError`, `ProtocolErrorCode` (with SDK-local failures separated) |
| schema-first `setRequestHandler(Schema, handler)` | method-first `setRequestHandler("tools/call", handler)` |

The official
[upgrade guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/upgrade-to-v2.md)
provides `@modelcontextprotocol/codemod v1-to-v2`, but explicitly says that dependency
injection seams with no imports are not rewritten. That applies to this repository's
plain server fakes in MCP tests, so the codemod output must be reviewed and those seams
updated manually.

For protocol serving:

- `serveStdio(() => buildServer(), { legacy: "serve" })` replaces direct
  `server.connect(new StdioServerTransport())`. The SDK pins the connection to the
  era selected by its opener and uses the same server factory for either path
  ([stdio serving](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/stdio.md),
  [legacy clients](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/legacy-clients.md)).
- `createMcpHandler(factory, { legacy: "stateless" })` is the web-standard,
  per-request HTTP entry with stateless 2025 fallback. `toNodeHandler` adapts it to
  Express/Node
  ([HTTP serving](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/http.md)).
- The SDK adds/removes per-era wire-only fields itself. Application handlers return
  the neutral result types; they should not manually add `resultType`, reserved
  envelope metadata, or MRTR retry fields
  ([2026 support guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/support-2026-07-28.md)).
- Modern cache fields default conservatively to `ttlMs: 0` and
  `cacheScope: "private"`. Real policies can be configured through
  `ServerOptions.cacheHints`; legacy responses are unaffected
  ([cache migration notes](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/support-2026-07-28.md#cache-fields-and-cache-hints)).

## Repository gap analysis

The current code is ahead of v1 but behind the final release:

| Area | Current repository | Final requirement / consequence |
| --- | --- | --- |
| SDK | `@modelcontextprotocol/sdk@1.29.0` | Migrate to stable split v2 packages before adopting official modern entries. |
| stdio | Direct v1 `StdioServerTransport` connection | Replace it with dual-era `serveStdio(..., { legacy: "serve" })`. |
| HTTP | Custom request classifier, boundary parser, and dispatcher beside v1 transport | Replace both paths with `createMcpHandler(..., { legacy: "stateless" })` + Node/Express adapter. |
| Header/version errors | Draft codes `-32001` and `-32004` | Final codes are `-32020` and `-32022`. |
| Request metadata | `clientInfo` is required by the custom parser | Final `clientInfo` is optional; present malformed data is still rejected. |
| Discovery | `serverInfo` is in the result body; no cache fields | Identity belongs in result `_meta`; discovery requires `ttlMs` and `cacheScope`. |
| HTTP names | Plain string comparison only | The final transport also requires Base64 sentinel decoding and `prompts/get` handling. |
| Parameter headers | No `x-mcp-header` / `Mcp-Param-*` validation | The SDK entry implements it; there is no current Huly schema using it, but the transport must remain correct when one is added. |
| Cache policy | Custom modern tools/templates use a five-minute `"public"` policy | Huly tool exposure can vary with per-request client information and configuration. Public caches may cross authorization contexts. Start with SDK `0/private`; adopt a nonzero/public hint only after proving the result is caller-independent. |
| Resource-not-found | Local legacy `-32002`, translated to `-32602` in the custom modern dispatcher | Final behavior is `-32602 Invalid Params`; remove the legacy-only mapping from the served path. |

The SDK replacement also removes an existing type cast around
`StreamableHTTPServerTransport` that is documented as a v1 exact-optional typing bug.
Leaving the custom dispatcher would retain duplicated protocol schemas at an I/O
boundary and make the repository responsible for every future protocol correction,
contrary to its Schema-as-Source-of-Truth and LLM-first single-call design rules.

### Final release deltas from the implemented draft/RC

The existing work was introduced in
[7c52399](https://github.com/dearlordylord/huly-mcp/commit/7c52399), followed by
[cd5dbbe](https://github.com/dearlordylord/huly-mcp/commit/cd5dbbe) and additional
dispatcher coverage in
[a429764](https://github.com/dearlordylord/huly-mcp/commit/a429764). Those commits
implemented a pre-final protocol directly on top of SDK v1. No associated current issue
or pull request was identified from the commit history.

The final release differs from the behavior asserted by that implementation in at
least these wire-visible ways:

- `HeaderMismatch` moved from `-32001` to `-32020`, and
  `UnsupportedProtocolVersion` moved from `-32004` to `-32022`.
- `clientInfo` changed from required to SHOULD/optional; a supplied malformed value
  still fails.
- `serverInfo` moved out of the `DiscoverResult` body into
  `_meta["io.modelcontextprotocol/serverInfo"]` on results.
- `server/discover` became a cacheable result and therefore requires `ttlMs` and
  `cacheScope`.
- Header handling includes the Base64 sentinel representation for unsafe `Mcp-Name`
  values and recognized `Mcp-Param-*` tool arguments.
- The stable SDK exposes supported serving entry points for HTTP and stdio, making the
  parallel application-owned wire codec unnecessary.

The first four are immediate interoperability failures against a final-spec client,
not optional cleanup.

## Implementation plan

### 1. Establish behavior before the dependency swap

- Add/retain black-box fixtures for the current tool/resource catalog, tool calls,
  per-request Huly `x-huly-*` configuration, bearer-token rejection, graceful shutdown,
  and request-scoped client classification.
- Define the dual-era posture in tests: modern requests use the final envelope, while
  exact `2025-06-18` initialize-era clients can initialize and list tools.
- Record that catalog ordering is deterministic. If current registry order is the
  contract, assert it rather than sorting solely to satisfy the protocol.

### 2. Migrate the SDK surface

- Add the stable packages actually used (`server`, `core`, `node`, and `express` as
  applicable), with Zod 4 available as required; remove the v1 monolith after no
  imports remain.
- Run the official codemod in a reviewed branch, then search for
  `@mcp-codemod-error`, the old package name, schema-first `setRequestHandler`,
  `McpError`, `ErrorCode`, and old transport imports.
- Manually update injected server factories and test fakes that the import-driven
  codemod cannot see.
- Keep the low-level shared protocol handler module as the functional core if useful,
  but type its inputs/outputs against v2 neutral types and register it once.

### 3. Adopt the official dual-era entries

- Make the server builder a cheap factory returning a fresh v2 `Server`/`McpServer`
  with the current identity, instructions, tools, resources, and handlers.
- Replace stdio transport construction and direct `connect` with
  `serveStdio(factory, { legacy: "serve" })`. Retain the returned handle for
  Effect-scoped shutdown and drain telemetry/tool calls before closing it.
- Replace the custom HTTP branch with one
  `createMcpHandler(requestAwareFactory, { legacy: "stateless" })`, adapt it to Express
  through the v2 Node adapter, and keep existing Host/Origin protection, request-body
  handling, bearer authentication, and `x-huly-*` request configuration in the
  imperative shell.
- Let the factory obtain client identity from the v2 per-request context/envelope
  rather than reparsing reserved `_meta` in project code.
- Start with SDK cache defaults (`0/private`). A later, separately justified change
  can add nonzero hints for truly invariant catalogs.

### 4. Remove the parallel protocol implementation

- Delete `http-2026-boundary.ts`, `http-2026-dispatcher.ts`, their draft-only schemas,
  classifiers, error-code constants, and tests that assert draft wire details.
- Replace them with transport-level tests against the SDK handler. Keep project tests
  for auth, Huly header routing, error translation, tool exposure, and shutdown.
- Do not reproduce `resultType`, `server/discover`, server identity stamping, header
  validation, caching fields, or `subscriptions/listen` in application code.

### 5. Verify both protocol eras and the real service

- Modern stdio: spawn the built command, open with `server/discover`, then list and
  call a tool without `initialize`.
- Legacy stdio: send an exact `2025-06-18` initialize opener to the built command,
  complete initialization, and list tools on the same pinned connection.
- Modern HTTP: exercise discovery, header validation, `tools/list`,
  `resources/templates/list`, `resources/read`, cache fields, server identity, and
  bearer auth through the mounted endpoint.
- Legacy HTTP: verify a `2025-06-18` initialize request and a released legacy client
  can list tools through the SDK's stateless fallback.
- Add an official MCP conformance run for the HTTP endpoint if the released
  [conformance framework](https://github.com/modelcontextprotocol/conformance)
  exposes stable 2026 server scenarios; do not baseline unexpected failures merely to
  make the gate green.
- Run `pnpm check-all`, then the required local-Huly integration suite with the
  container URL rewrite documented in `AGENTS.md`.

### 6. Ship the protocol migration visibly

- Add an appropriate Changesets entry describing final-protocol support and retained
  `2025-06-18` compatibility.
- Replace README text describing the custom dual dispatcher with the SDK-owned
  dual-era behavior.
- Remove the integration harness's `legacy|2026` success switch. The normal suite
  should exercise 2026; focused transport tests own legacy compatibility.

## Acceptance criteria

- One server factory registers Huly tools/resources for final `2026-07-28`.
- Stdio and HTTP accept a conforming `2026-07-28` client without an initialize
  handshake.
- MCP `2025-06-18` stdio and HTTP clients can initialize and call tools through the
  SDK-owned compatibility paths.
- Modern discovery and ordinary results have final-spec identity, result, cache, and
  error shapes; project code does not manually synthesize reserved wire fields.
- Per-request client identity and `x-huly-*` configuration still select the correct
  tool exposure and Huly workspace.
- No tool catalog that varies by caller is advertised as publicly cacheable.
- Bearer authentication, Host/Origin protection, cleanup, telemetry drain, all project
  quality gates, and local-Huly integration tests pass.

## Remaining decision worth confirming

Compatibility is settled: final `2026-07-28` plus SDK-owned `2025-06-18` serving.

The remaining product choice is caching: use conservative `0/private` hints at launch
(recommended), or make a product promise that particular catalogs are safe to share
across callers. The current client-sensitive tool-exposure logic makes a broad
`"public"` policy unsafe without a stronger invariant.

MRTR, Tasks, and MCP extensions do not need a product decision for basic 2026 support;
they can be added later as separate features.
