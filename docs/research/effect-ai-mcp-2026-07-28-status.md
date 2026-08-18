# Effect AI MCP `2026-07-28` status and Huly MCP degradation report

**Status date:** 2026-08-18  
**Scope:** Huly MCP issues [#235](https://github.com/dearlordylord/huly-mcp/issues/235) and
[#236](https://github.com/dearlordylord/huly-mcp/issues/236), the pinned
`effect@4.0.0-rc.108` package, current upstream Effect source, and the official
Model Context Protocol specification.

**Disposition:** the executive decision on 2026-08-18 removes the degraded
Effect migration from `master` by restoring the exact pre-migration tree and
keeps further Effect work isolated on a dedicated branch/worktree. That branch
pins the selected upstream implementation by commit, configures both
`2026-07-28` and `2025-06-18`, and must pass the recovery verification below
before it is considered merge-ready. The critical classification in this
report explains the rejected single-era state; it is not a claim that restored
`master` still has the degradation.

## Recovery implementation status

The isolated recovery branch now implements the selected path and is prepared
for a future merge. The branch configures both `2026-07-28` and `2025-06-18`,
records the selected Effect source commit and patch digest, and retains the
legacy behavioral oracle.

Verification on 2026-08-18 produced these results:

- 276 dated upstream adapter conformance tests passed and 9 were skipped,
  including all 117 modern adapter tests.
- A live modern stdio client negotiated `2026-07-28` against local Huly, listed
  524 native tools, and completed `get_huly_context` and `list_projects` calls.
- The full local Huly integration suite passed 1,091 cases, failed 0, and
  skipped 28.
- `pnpm check-all` passed 4,148 tests with all coverage thresholds above 99%.
- Packed MCP and CLI artifacts passed dependency and smoke certification.
- Modern HTTP tests cover stateless discovery, tools, resource templates,
  result/cache metadata, and request-scoped client lease isolation.

These results satisfy the executable Huly recovery boundary. Multi-round-trip
requests and subscriptions pass the dated adapter conformance suite, but no
Huly business operation currently uses those protocol capabilities. HTTP
concrete `resources/list` remains intentionally disabled for the credential
isolation reason documented below.

## Finding

The removal of MCP `2026-07-28` from Huly MCP is a **critical feature
degradation**.

**Release recommendation:** treat this degradation as release-blocking for a
general npm release. Do not publish `@firfi/huly-mcp` until the release owner
either selects a restoration path or explicitly accepts and communicates a
legacy-only product contract.

MCP `2026-07-28` is the current stable protocol revision. It is not a draft or
release candidate. The official release is dated July 28, 2026, and the tagged
schema declares it as `LATEST_PROTOCOL_VERSION`.
([release](https://github.com/modelcontextprotocol/modelcontextprotocol/releases/tag/2026-07-28),
[tag commit](https://github.com/modelcontextprotocol/modelcontextprotocol/commit/5f5440bb26a62e2cf3440b92da5a667efa03b267),
[schema](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/2026-07-28/schema/2026-07-28/schema.ts))

Huly MCP supported the modern `2026-07-28` wire contract at the pre-migration
baseline `5d499f1` before issue #235.
The completed migration pins the production server to Effect AI's
`2025-06-18` adapter. This is two stable revisions behind the current protocol:
`2025-11-25` and `2026-07-28`.
([pre-migration README](https://github.com/dearlordylord/huly-mcp/blob/5d499f1/README.md#L235),
[current adapter selection](https://github.com/dearlordylord/huly-mcp/blob/bab8456/src/mcp/server.ts#L189),
[current package pin](https://github.com/dearlordylord/huly-mcp/blob/bab8456/package.json))

The official compatibility matrix states that a modern-only client fails
against a legacy server. A dual-era client can probe and fall back, but fallback
is a client capability and is not guaranteed.
([official versioning rules](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning))

The migration preserved Huly's tool and resource operations under the older
protocol. It did not preserve the current protocol era, modern-only client
interoperability, or the modern deployment and interaction model. Passing tests
for the `2025-06-18` contract do not reduce this compatibility loss.

Issue #236 produced strong certification evidence for the migrated target. It
proved that the built and packed artifacts implement the deliberately
downgraded `2025-06-18` contract and preserve Huly operations under that
contract. It did **not** prove parity with the pre-migration `2026-07-28`
surface. The issue required removed modern behavior to be classified as an
accepted breaking change and prohibited restoration of that compatibility path.
A green issue #236 result is therefore evidence of downgrade correctness, not
evidence that no degradation occurred.
([issue #236](https://github.com/dearlordylord/huly-mcp/issues/236))

## Evidence summary

| Evidence | Verified state on 2026-08-18 | Consequence |
|---|---|---|
| Official MCP release | `2026-07-28` is stable and current | The removed contract is a released protocol, not an experimental option |
| Huly MCP at `5d499f1` | SDK v2 served `2026-07-28` and retained legacy compatibility | The migration removed an existing production capability |
| Huly MCP after #235 | Only `McpProtocol.v2025_06_18` is configured | Modern requests are not accepted |
| Pinned Effect `rc.108` | Only `v2025_06_18` exists | Huly cannot enable `2026-07-28` by configuration |
| Latest released Effect `rc.110` | Adds adapters through `2025-11-25`, but not `2026-07-28` | A released Effect upgrade does not yet restore the current protocol |
| Upstream Effect `main` at `ff98f0b` | Supports `2024-11-05`, `2025-03-26`, `2025-06-18`, and `2025-11-25` | Upstream default branch remains legacy-only |
| Effect issue #7024 | Open | Upstream tracks the missing modern era as unfinished work |
| Upstream development branch | Open and not released; required approval gate was waiting | A recovery implementation exists, but is not yet a consumable released dependency |

Primary Effect sources:

- [Installed-version source at the `effect@4.0.0-rc.108` tag](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.108/packages/effect/src/unstable/ai/McpProtocol.ts)
- [Latest released Effect `rc.110`](https://github.com/Effect-TS/effect/releases/tag/effect%404.0.0-rc.110)
- [Current upstream protocol exports at commit `ff98f0b`](https://github.com/Effect-TS/effect/blob/ff98f0b0e2beb331209e37e42095d8d6e8e0b6c2/packages/effect/src/unstable/ai/McpProtocol.ts)
- [Effect issue #7024](https://github.com/Effect-TS/effect/issues/7024)
- [Selected upstream implementation commit](https://github.com/lloydrichards/open_effect/commit/ebcfcb45cb9ae1c1b9725598caa27ec2e8747657)

## What issue #235 changed

Issue #235 explicitly authorized a direct breaking migration. Its specification
said that removing `2026-07-28`, `server/discover`, stateless pre-initialize
calls, SDK-v2 headers, and cache metadata was acceptable. It also prohibited a
parallel server or compatibility backport.
([issue #235](https://github.com/dearlordylord/huly-mcp/issues/235))

That acceptance criterion explains why the implementation passed its ticket
review. It does not change the external effect of the decision. The accepted
scope traded a current, dual-era protocol edge for a single Effect-native,
legacy-era edge.

Before the migration, Huly MCP used the official MCP TypeScript SDK v2 and
advertised both behaviors:

- Modern `2026-07-28` requests used per-request metadata, no initialization
  handshake, and no protocol session.
- Legacy `2025-06-18` clients used SDK-owned compatibility behavior.
- Modern HTTP requests used `MCP-Protocol-Version`, `Mcp-Method`, and, where
  applicable, `Mcp-Name` headers.
- Modern discovery and cacheable results included `resultType`, `ttlMs`,
  `cacheScope`, and server identity metadata.

These statements are present in the former
[README](https://github.com/dearlordylord/huly-mcp/blob/5d499f1/README.md#L235),
[stdio protocol tests](https://github.com/dearlordylord/huly-mcp/blob/5d499f1/test/mcp/stdio-transport.test.ts#L309-L338),
and
[HTTP protocol tests](https://github.com/dearlordylord/huly-mcp/blob/5d499f1/test/mcp/http-transport.test.ts#L213-L238).

## Direct Huly regressions from `5d499f1`

These behaviors existed at the baseline and are absent at `bab8456`. They are
observed Huly regressions, not a list of every feature in the modern
specification.

| Baseline behavior | Current behavior | Direct impact |
|---|---|---|
| Strict modern clients could use `server/discover` and `2026-07-28` | Only the legacy `2025-06-18` initialize lifecycle is registered | Modern-only clients fail |
| Modern HTTP calls were stateless | HTTP calls require an initialized Effect session and `Mcp-Session-Id` | Replica routing and restart behavior depend on session state |
| Protocol version, client identity, and capabilities arrived per request | These facts are captured during legacy initialization | Independent modern calls and request-level profile changes are unavailable |
| `Mcp-Method` and method-specific `Mcp-Name` were validated | The modern header contract is absent | Gateways lose standard header-level routing and policy inputs |
| Results carried `resultType`; cacheable operations also carried `ttlMs` and `cacheScope` | The legacy result shape omits these fields | Standard result discrimination and cache policy are unavailable |
| HTTP `resources/list` returned concrete active project resources | HTTP `resources/list` is intentionally empty; only templates and request-scoped reads remain | HTTP clients lose project discovery through the resource list |

The concrete-resource regression is separate from the protocol version itself,
but it occurred in the same migration. The baseline README stated that
`resources/list` returned concrete active projects, and the integration suite
asserted that a project was present.
([baseline resource documentation](https://github.com/dearlordylord/huly-mcp/blob/5d499f1/README.md#L310),
[baseline integration assertion](https://github.com/dearlordylord/huly-mcp/blob/5d499f1/scripts/integration_test_full.sh#L1349-L1354))

The current implementation disables concrete discovery for HTTP because Effect
AI's registry is process-global while Huly credentials are request-scoped. This
prevents cross-workspace identifier disclosure, but the safe implementation
also removes concrete HTTP discovery.
([current ADR](https://github.com/dearlordylord/huly-mcp/blob/bab8456/docs/adr/0004-effect-ai-mcp-transport.md#L46-L52),
[current user documentation](https://github.com/dearlordylord/huly-mcp/blob/bab8456/README.md#L314-L317))

After the migration, the production configuration is:

```ts
const protocolOptions = {
  name: "huly-mcp",
  version: VERSION,
  protocols: [McpProtocol.v2025_06_18]
} as const
```

The installed adapter itself fixes its version to `2025-06-18`:

```ts
export const v2025_06_18: ProtocolAdapter = Internal.make({
  protocolVersion: "2025-06-18",
  // ...
})

export type ProtocolVersion = ProtocolAdapter["protocolVersion"]
```

The Effect server accepts an array of adapters, but `rc.108` exports only this
one adapter. The multi-adapter API does not synthesize support for a protocol
whose schemas, lifecycle, and wire projections are absent.

## Wire-level incompatibility

### Modern request that Huly MCP previously accepted

Under `2026-07-28`, discovery is optional and each operation is self-contained.
The request carries client facts in `_meta`; HTTP duplicates routing facts in
headers.

```http
POST /mcp HTTP/1.1
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2026-07-28
Mcp-Method: tools/call
Mcp-Name: list_projects

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "list_projects",
    "arguments": {},
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": {},
      "io.modelcontextprotocol/clientInfo": {
        "name": "example-agent",
        "version": "1.0.0"
      }
    }
  }
}
```

This request does not perform `initialize`. A `2025-06-18` Effect AI server
does not interpret it under modern semantics. The official compatibility matrix
classifies a modern client with a legacy server as a failed combination.

### Exchange now required by Huly MCP

The current server requires the legacy handshake and, over HTTP, a returned
session identifier:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"example-agent","version":"1.0.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_projects","arguments":{}}}
```

For Streamable HTTP, later requests must also return the negotiated
`Mcp-Session-Id` and `MCP-Protocol-Version` headers. This is a different
lifecycle, not a spelling change.

### Discovery failure

The current protocol has no `server/discover` method. A modern client can send:

```json
{
  "jsonrpc": "2.0",
  "id": "discover-1",
  "method": "server/discover",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

A dual-era client may treat a non-modern error or timeout as a signal to retry
with `initialize`. A modern-only client has no legacy fallback and fails. The
official specification requires modern servers to implement
`server/discover` and defines `UnsupportedProtocolVersionError` (`-32022`) so a
client can choose from the advertised versions.
([discovery](https://modelcontextprotocol.io/specification/2026-07-28/server/discover),
[versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning))

## Capabilities lost or unavailable

The official `2026-07-28` changelog is relative to `2025-11-25`. Because Huly
MCP stops at `2025-06-18`, the complete gap is the union of the
[2025-11-25 changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog)
and the
[2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog).

The severity assessment separates two classes:

- **Direct regressions verified against `5d499f1`:** modern-only client
  compatibility, stateless HTTP, `server/discover`, per-request protocol and
  client metadata, modern routing headers, result/cache fields, and concrete
  HTTP `resources/list` discovery.
- **Modern capabilities not shown in a certified Huly workflow before #235:**
  MRTR, `subscriptions/listen`, extension negotiation, modern Tasks, and the
  later authorization flow. Their absence reduces conformance and future
  feature capacity, but this review does not claim that an existing Huly tool
  invocation used them and then stopped working.

### 1. Modern-only client interoperability — critical and immediate

The server no longer speaks the version selected by a modern-only client.
Current HTTP ingress rejects a `2026-07-28` protocol header with HTTP 400, and
the stdio registry has no `server/discover` method or modern request lifecycle.
The modern connection therefore fails on both transports.

Dual-era clients remain usable if their fallback is implemented correctly.
Legacy clients remain usable. Therefore, the degradation is not a universal
outage, but it is a hard compatibility break for the current protocol era.

### 2. Stateless HTTP deployment — critical for horizontal operation

`2026-07-28` removes protocol-managed sessions. Each request contains its
protocol version and client capabilities. Any server instance can process it.
The current Huly server instead creates a session and requires the client to
return `Mcp-Session-Id`.

Consequences include:

- A load balancer needs sticky routing or shared session state for a multi-node
  Huly MCP deployment.
- Session state consumes server memory and is lost when the process restarts.
- A request cannot move freely between replicas.
- Session acquisition and cleanup remain part of the failure surface.

Application-level state is still possible in the modern protocol. The change is
only that such state uses explicit application handles instead of an implicit
transport session.

### 3. Discovery and standard version recovery — critical for negotiation

`server/discover` advertises supported versions, capabilities, identity,
instructions, and cache policy in one request. It is also the specified stdio
probe for dual-era clients.

Without it:

- A modern client cannot inspect Huly MCP before selecting a method.
- Huly MCP cannot return the standard modern unsupported-version response with
  a `supported` list.
- Client behavior depends on heuristic legacy fallback.

### 4. Header-based HTTP routing — material operational loss

Modern HTTP requires `Mcp-Method` and method-specific `Mcp-Name`. A gateway can
route, filter, meter, and observe calls without parsing the JSON body. Examples
include sending selected tools to dedicated workers or applying a policy to a
destructive tool by name.

The legacy edge does not implement these headers as routing contract. Gateways
must inspect bodies or treat all `/mcp` requests uniformly.

### 5. Per-request identity and capability isolation — material semantic loss

Modern requests carry protocol version, client capabilities, and optional
client identity on every request. The legacy server records these facts during
`initialize` and reuses them for the session.

Huly's native/proxy tool exposure depends on client classification. The current
implementation preserves that decision for initialized clients, but it cannot
make the decision from independent modern requests. A caller that requires
request-level identity or capability changes must open another legacy session.

### 6. Cacheable discovery, lists, and reads — material performance loss

Modern cacheable results require:

- `ttlMs`, which tells clients how long a result remains fresh.
- `cacheScope`, which identifies private or publicly shareable results.
- Deterministic tool ordering, which improves client and LLM prompt-cache hit
  rates.

The migrated server does not return modern cache metadata. Clients must poll or
apply their own non-standard cache policy. For Huly data, most results should be
private, but an explicit private cache hint is still useful and safer than an
implicit assumption.

### 7. Multi Round-Trip Requests — unavailable

`2026-07-28` replaces server-initiated roots, sampling, and elicitation RPCs with
a stateless Multi Round-Trip Request pattern. A tool, prompt, or resource result
can return:

```json
{
  "resultType": "input_required",
  "inputRequests": {
    "approval": {
      "method": "elicitation/create",
      "params": { "message": "Approve this destructive change?" }
    }
  },
  "requestState": "opaque-server-state"
}
```

The client supplies keyed `inputResponses` when it retries the original
operation. The current adapter has no modern result envelope or continuation
model.

Huly MCP did not certify an Huly operation that actively used this pattern
before #235. The immediate regression is protocol capability and future feature
headroom, rather than the loss of a known Huly tool flow. It becomes functional
loss when an operation needs standardized approval, elicitation, sampling, or
roots input without holding a reverse-RPC session.

### 8. Modern subscription stream — unavailable

`subscriptions/listen` replaces the standalone HTTP GET stream and
`resources/subscribe`/`resources/unsubscribe`. A client opts in to tool,
prompt, resource-list, or concrete-resource changes. The server tags each
notification with the originating subscription identifier.

The current Effect adapter retains legacy notification mechanisms. It does not
provide the modern, transport-neutral subscription stream. Huly MCP does not
currently expose a certified end-user workflow that depends on modern
subscriptions, so this is a capability and evolution loss rather than a proven
break in current tool calls.

### 9. Extension negotiation and modern Tasks — unavailable

The modern capability object has a standard `extensions` map. This is the
negotiation point for optional protocols such as MCP Apps and the redesigned
Tasks extension. A `2025-06-18` server cannot participate in this standard
negotiation model.

This blocks standards-based adoption through the current server edge. It does
not mean the existing Huly operations lost a task implementation; no such
extension was certified before the migration.

### 10. Schema and result expressiveness — reduced

The modern protocol:

- Uses JSON Schema 2020-12 for tool input and output contracts.
- Allows the complete JSON Schema keyword set, subject to defined resource
  bounds.
- Allows `structuredContent` to contain any JSON value, not only an object.
- Requires `resultType` on every successful result.
- Uses `-32602` for a missing resource.

Huly MCP preserved the schemas and structured results that the Effect
`2025-06-18` adapter can express. It cannot advertise or encode the additional
modern forms. This can force schema projection, prevent primitive or array
structured output from being represented as specified, and produce different
error semantics.

### 11. Features introduced in `2025-11-25` are also absent

The downgrade is not only a loss of the stateless era. The pinned adapter also
precedes `2025-11-25`, which introduced or standardized:

- Icons on tools, resources, resource templates, and prompts.
- Richer elicitation, including enum improvements, defaults, and URL mode.
- Sampling tool use through `tools` and `toolChoice`.
- The JSON Schema 2020-12 default.
- OIDC discovery, incremental scope consent, Client ID Metadata Documents, and
  additional authorization and transport clarifications.
- The earlier experimental Tasks model.

Some of these features were redesigned again in `2026-07-28`. They are listed
to show the full revision gap, not to recommend implementing obsolete
intermediate forms.

### 12. Authorization hardening — specification gap, not a proven Huly defect

The two later revisions add issuer validation, client application-type rules,
credential binding, OIDC discovery, and client registration guidance. Huly MCP
uses its own bearer authentication and Huly credential boundary rather than the
complete MCP authorization flow.

No evidence in this review proves that current Huly authentication is
vulnerable. The correct finding is narrower: the server cannot claim conformance
with the later MCP authorization contract, and later auth behavior is not
available through the pinned adapter.

## Current upstream Effect status

### Pinned release: `effect@4.0.0-rc.108`

The installed package exports only `McpProtocol.v2025_06_18`. Its
`ProtocolVersion` type is derived from that single adapter. There is no
`v2026_07_28` schema, adapter, discovery lifecycle, MRTR model, or subscription
runtime in the release.

**Conclusion:** Huly MCP cannot restore the modern protocol on `rc.108` by
adding another value to the `protocols` array.

Effect issue
[#6617](https://github.com/Effect-TS/effect/issues/6617) defined the
multi-protocol seam needed for the modern era. The merged implementation, PR
[#6625](https://github.com/Effect-TS/effect/pull/6625), explicitly states that
it added version isolation and the `2025-06-18` adapter but did **not** implement
`2025-11-25` or `2026-07-28`. The seam permits a later adapter; it is not itself
modern protocol support.

### Latest released Effect: `effect@4.0.0-rc.110`

Effect commit
[`6eebd0a`](https://github.com/Effect-TS/effect/commit/6eebd0a618308a91f95947bae6e0fb206ae3939d)
added `v2025_11_25`. Current exports cover four legacy versions through
`2025-11-25`.

The latest release therefore improves legacy coverage, but it does not restore
the modern protocol era.

### Open implementation: issue #7024 and its development branch

Effect
[#7024](https://github.com/Effect-TS/effect/issues/7024) explicitly tracks a
first-class `McpProtocol.v2026_07_28` adapter. The issue identifies the change as
a new protocol era, not an incremental schema revision. Its acceptance criteria
include:

- Stateless per-request adapter selection.
- `server/discover` and modern errors.
- Header/body routing validation.
- MRTR and byte-exact `requestState` continuation.
- `subscriptions/listen`.
- JSON Schema 2020-12 and unrestricted JSON structured content.
- Mixed-era conformance.

The selected
[upstream implementation commit](https://github.com/lloydrichards/open_effect/commit/ebcfcb45cb9ae1c1b9725598caa27ec2e8747657)
implements that design.
At the status date it was open, not released, and had no approving review. Its
required approval gate was waiting, while build, type, lint, and platform test
checks were successful.

The size is material: the PR reports 50 changed files, 6,093 additions, and
1,301 deletions. It changes both MCP and Effect RPC runtime internals. The PR
adds 117 focused `2026-07-28` tests, but its own discussion records continuing
external conformance work and gaps found in the wider adapter suite.

**Inference:** the upstream direction is clear and active, but merge date,
final API shape, first release version, and complete external conformance remain
uncertain. An open, green PR is not a released dependency.

## Benefits retained by the Effect migration

The critical classification does not negate the completed engineering benefits:

- The protocol edge, lifecycle, cancellation, and cleanup now use Effect
  scopes and typed effects.
- The old Promise SDK path and its dependencies were removed.
- The complete Huly tool corpus remains shared with the CLI.
- Tool content, warnings, typed failures, telemetry, resources, request-scoped
  Huly clients, and bounded shutdown were certified under `2025-06-18`.
- The migration passed the repository quality gate and local Huly integration
  suite.

These are implementation and maintainability gains. They do not provide
wire-level equivalence with `2026-07-28`.

## Recovery options

### Option A — adopt the first released Effect version with `v2026_07_28`

This is the preferred long-term path if the project keeps the single Effect AI
edge.

Required work:

1. Track Effect issue #7024 and the selected upstream implementation to merge and release.
2. Upgrade from `rc.108` to the first release that exports
   `McpProtocol.v2026_07_28`.
3. Configure a dual-era server where practical, with `2026-07-28` plus the
   required legacy adapters.
4. Adapt Huly's request context, native/proxy classification, request-owned
   client lifecycle, resources, telemetry, and shutdown to the stateless
   request context.
5. Restore modern wire certification for stdio and HTTP.
6. Re-run packed-artifact, local Huly, behavioral-oracle, security, mixed-era,
   and quality-gate tests.

Benefits:

- Preserves the single Effect architecture.
- Uses the upstream lifecycle and conformance implementation.
- Can restore modern and legacy interoperability on one edge.

Drawbacks:

- Release timing and final APIs are not known.
- The upstream change is large and touches Effect RPC internals.
- A direct jump from `rc.108` includes unrelated Effect changes and needs full
  recertification.

### Option B — help complete and validate the upstream implementation

The project can contribute review, Huly integration cases, and external MCP
conformance evidence upstream while waiting for a release.

Benefits:

- Reduces uncertainty in the preferred recovery path.
- Huly's 524-tool catalog and request-scoped credential model provide useful
  scale and isolation cases.
- Avoids maintaining a permanent private protocol implementation.

Drawbacks:

- Upstream review and release remain outside this repository's control.
- It does not immediately restore released-package support.

### Option C — temporarily pin the upstream PR commit or maintain an Effect fork

This can restore the protocol before an official Effect release.

Benefits:

- Keeps the runtime architecture close to the planned upstream implementation.
- Enables early Huly compatibility and conformance testing.

Drawbacks:

- Depends on unreleased, unstable code.
- The PR can be rebased or changed during review.
- The project becomes responsible for auditing more than 6,000 added lines and
  carrying a fork until release.
- Publishing a package against a commit or fork complicates dependency closure
  and support.

This option is suitable for a branch or release candidate. It is high risk for
an immediate production release.

### Option D — restore the official MCP SDK v2 as a compatibility edge

This reintroduces the pre-#235 modern wire implementation while retaining an
Effect application core behind it.

Benefits:

- Uses an official SDK that already supports the stable protocol.
- Can recover modern interoperability before Effect ships its adapter.
- Reuses the general shape of the pre-migration implementation and tests.

Drawbacks:

- Reverses the single-edge decision in issue #235.
- Restores the deleted SDK dependencies and a Promise/Effect boundary.
- A dual-server or dual-transport design increases lifecycle and parity risk.
- Requires renewed certification and an ADR change.

This is the fastest released-dependency recovery if modern interoperability is
a release blocker and waiting for Effect is not acceptable.

### Option E — build a private `2026-07-28` adapter on Effect internals

This is not recommended. Effect's own implementation required a lifecycle
split, MCP core changes, RPC streaming changes, dated schemas, MRTR,
subscriptions, and a large conformance suite. Reproducing it locally would
create a protocol fork on unstable internal APIs.

### Option F — explicitly accept legacy-only service for a limited release

The current server can ship as a legacy-only release if product requirements
permit it.

Minimum controls:

- Label the release as legacy MCP `2025-06-18`, not current MCP support.
- State that modern-only clients are incompatible.
- Publish the required initialize/session exchange.
- Track Effect #7024 as a release follow-up with an owner and target decision
  date.
- Do not describe removal of `2026-07-28` as a minor limitation.

Benefits:

- Ships the certified Effect migration without another runtime change.
- Retains compatibility with known legacy and dual-era clients that fall back.

Drawbacks:

- Leaves the critical compatibility and deployment degradation in production.
- The set of clients that fall back can change outside this repository.
- Delayed recovery can make later migration harder as modern extensions become
  common.

## Historical recommendation for the rejected single-era state

This section records the release recommendation made before the executive
recovery decision. It applies to the rejected `2025-06-18`-only build, not to
the isolated dual-era recovery branch described at the start of this report.

Treat restoration of `2026-07-28` as a **release-blocking** compatibility work
item, not routine backlog. Do not npm-publish until the release owner records a
decision to restore modern support, delay publication, or accept a clearly
labelled legacy-only release.

1. Do not publish a general compatibility claim for the rejected single-era build.
   State `MCP 2025-06-18 only` and document that modern-only clients fail.
2. Track the upstream implementation daily until it merges or is replaced. Contribute Huly
   integration and mixed-era tests if upstream accepts them.
3. Prepare an upgrade branch against the PR or first release. Do not ship the
   unreleased commit without a separate risk decision.
4. Set a decision point: if a released Effect adapter is not available by the
   required Huly release date, choose between delaying the release and restoring
   the official SDK v2 compatibility edge.
5. Require the recovery to support both `2026-07-28` and necessary legacy
   clients. Replacing one single-era edge with the other would move, not solve,
   the compatibility problem.

## Required recovery verification

A recovery is complete only when the built and packed Huly MCP artifact proves:

- `server/discover` over stdio and HTTP.
- Direct tool and resource calls without `initialize`.
- Per-request client identity and native/proxy exposure.
- `MCP-Protocol-Version`, `Mcp-Method`, and `Mcp-Name` validation.
- No `Mcp-Session-Id` for modern HTTP requests.
- Modern `resultType`, server identity, `ttlMs`, and `cacheScope` fields.
- Unsupported-version error `-32022` with requested and supported versions.
- At least one MRTR continuation with byte-exact `requestState`.
- At least one `subscriptions/listen` stream and subscription identifier.
- Mixed modern and legacy clients on the supported transport configuration.
- Request-scoped Huly credential isolation across modern HTTP requests.
- Local Huly read, write, resource, auth, cancellation, and cleanup behavior.
- Behavioral-oracle review, packed-artifact certification, and
  `pnpm check-all`.

## Limits and uncertainty

- Upstream repository state can change after 2026-08-18. Issue and PR state
  must be checked again before a release decision.
- Successful Effect PR checks do not prove complete official MCP conformance.
  The upstream author reports focused tests and continuing external
  conformance work.
- The initial research did not execute the selected Effect source against Huly.
  The later recovery implementation did so; its results are recorded in
  “Recovery implementation status” and ADR-0005. Estimates for future upstream
  rebases remain directional.
- The official specification establishes protocol requirements. It does not
  guarantee that every client is modern-only or dual-era.
- No evidence shows that existing Huly tool operations failed under certified
  `2025-06-18` clients. The critical finding concerns protocol interoperability,
  deployment behavior, and removed current-era capabilities.

## Primary sources

### Official MCP

- [Stable `2026-07-28` release](https://github.com/modelcontextprotocol/modelcontextprotocol/releases/tag/2026-07-28)
- [Official `2026-07-28` specification](https://modelcontextprotocol.io/specification/2026-07-28)
- [Authoritative tagged schema](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/2026-07-28/schema/2026-07-28/schema.ts)
- [Versioning and compatibility](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)
- [`server/discover`](https://modelcontextprotocol.io/specification/2026-07-28/server/discover)
- [`2026-07-28` changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- [`2025-11-25` changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog)
- [Official GA announcement](https://blog.modelcontextprotocol.io/posts/2026-07-28/)

### Effect

- [`rc.108` MCP protocol source](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.108/packages/effect/src/unstable/ai/McpProtocol.ts)
- [`rc.110` release](https://github.com/Effect-TS/effect/releases/tag/effect%404.0.0-rc.110)
- [Current upstream protocol source at `ff98f0b`](https://github.com/Effect-TS/effect/blob/ff98f0b0e2beb331209e37e42095d8d6e8e0b6c2/packages/effect/src/unstable/ai/McpProtocol.ts)
- [Multi-protocol design issue #6617](https://github.com/Effect-TS/effect/issues/6617)
- [Merged adapter-seam PR #6625](https://github.com/Effect-TS/effect/pull/6625)
- [Multi-protocol foundation commit](https://github.com/Effect-TS/effect/commit/0a532e503f165fdea485a5343fc2f420917e8376)
- [`2025-11-25` adapter commit](https://github.com/Effect-TS/effect/commit/6eebd0a618308a91f95947bae6e0fb206ae3939d)
- [Effect issue #7024](https://github.com/Effect-TS/effect/issues/7024)
- [Selected upstream implementation commit](https://github.com/lloydrichards/open_effect/commit/ebcfcb45cb9ae1c1b9725598caa27ec2e8747657)

### Huly MCP

- [Issue #235](https://github.com/dearlordylord/huly-mcp/issues/235)
- [Issue #236](https://github.com/dearlordylord/huly-mcp/issues/236)
- [Pre-migration `2026-07-28` documentation](https://github.com/dearlordylord/huly-mcp/blob/5d499f1/README.md#L235)
- [Pre-migration stdio modern-protocol tests](https://github.com/dearlordylord/huly-mcp/blob/5d499f1/test/mcp/stdio-transport.test.ts#L309-L338)
- [Pre-migration HTTP modern-protocol tests](https://github.com/dearlordylord/huly-mcp/blob/5d499f1/test/mcp/http-transport.test.ts#L213-L238)
- [Current Effect protocol configuration](https://github.com/dearlordylord/huly-mcp/blob/bab8456/src/mcp/server.ts#L189)
- [Effect migration ADR](https://github.com/dearlordylord/huly-mcp/blob/bab8456/docs/adr/0004-effect-ai-mcp-transport.md)
