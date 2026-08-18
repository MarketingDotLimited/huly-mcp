# ADR-0004: Effect AI MCP transport and protocol cutover

- Status: superseded by ADR-0005
- Date: 2026-08-17
- Decision owners: Huly MCP maintainers

## Context

Huly MCP previously composed the MCP edge from the MCP SDK and exposed a
2026-07-28 discovery/stateless HTTP path alongside 2025-06-18 compatibility.
That split required transport-specific request metadata, duplicated lifecycle
logic, and allowed callers to invoke tools before a session had been
initialized. Effect `4.0.0-rc.108` provides the MCP server, schema projection,
NDJSON stdio transport, and Streamable HTTP routing in `effect/unstable/ai`.
Its implemented protocol adapter is MCP `2025-06-18`.

## Decision

Migrate the MCP edge directly to Effect AI and make MCP `2025-06-18` the only
supported wire contract. The migration is intentionally breaking: there is no
parallel SDK server, protocol-version shim, or stateless compatibility branch.
The existing operation/tool registry remains the source of Huly behavior and
is attached through one generic Effect AI registration adapter.

Every stdio connection must send `initialize`, then
`notifications/initialized`, and keep all requests on that NDJSON stream.
Every HTTP client must POST JSON-RPC with `Content-Type: application/json` and
`Accept: application/json, text/event-stream`; initialization returns
`Mcp-Session-Id` and the negotiated `MCP-Protocol-Version`, which the client
must echo on subsequent requests. HTTP sessions are process-local and are
invalid after a server restart. The server's Effect AI HTTP layer owns session
routing, protocol negotiation, request validation, and response framing.

## Consequences

Clients using `server/discover`, MCP `2026-07-28`, `Mcp-Method`, `Mcp-Name`,
per-request protocol metadata, or stateless HTTP calls must update their
handshake. Omitting `arguments` from `tools/call` is a protocol error even for
parameterless tools; callers send `arguments: {}`. Effect AI owns the visible
JSON Schema dialect, structured-content projection, tool error encoding, HTTP
status behavior, and session identifiers. Huly-owned tool names, annotations,
schemas where representable, rich content, resource handlers, authentication,
sanitized configuration, request-scoped Huly cleanup, and shutdown guarantees
remain required.

Concrete resource discovery is process-scoped and therefore enabled only for
stdio. Effect AI's HTTP resource registry is process-global, while Huly HTTP
credentials and workspaces are request-scoped; registering one request's
project URIs globally could disclose another workspace's identifiers. HTTP
therefore exposes the three resource templates, keeps `resources/list` empty,
and resolves every `resources/read` through the current request's sanitized
configuration and scoped client lease.

Certification drives the real built artifact over both transports. The wire
client used by certification is deliberately small and dependency-free: it
implements NDJSON response matching and HTTP session headers directly, while
parsing all received payloads through Effect Schema. This keeps release checks
aligned with the exact Effect AI transport and avoids reintroducing the SDK as
a test-only dependency.

## Rejected alternatives

1. Retaining the SDK and adding an Effect AI compatibility adapter would leave
   two protocol/lifecycle implementations and preserve the split that this
   decision removes.
2. Keeping 2026 stateless HTTP as a fallback would make negotiation and
   session behavior client-dependent and would continue certifying a transport
   that is not provided by Effect AI.
3. Requiring a separate MCP client library for certification would make the
   release gate depend on library-owned wire behavior rather than the built
   server's actual exchange.

## Upgrade risk

`effect/unstable/ai` is explicitly unstable. An Effect upgrade may change MCP
wire details or the registration API. Such an upgrade requires rerunning the
stdio/HTTP artifact certification, reviewing the behavioral-oracle delta, and
updating this ADR if the supported protocol or session contract changes.
