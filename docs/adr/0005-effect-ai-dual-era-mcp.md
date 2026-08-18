# ADR-0005: Effect AI dual-era MCP protocol support

- Status: accepted
- Date: 2026-08-18
- Supersedes: ADR-0004's single-protocol decision
- Decision owners: Huly MCP maintainers

## Context

The direct Effect AI migration retained Huly operations but configured only
MCP `2025-06-18`. That removed the existing `2026-07-28` stateless lifecycle,
including `server/discover`, modern HTTP routing headers, request-scoped client
metadata, and modern result/cache metadata. The removal is classified as a
critical feature degradation.

The selected upstream Effect development branch implements the modern adapter
while retaining the stateful legacy adapters. Its source is pinned by commit in
`patches/effect-mcp-source.json`. Until an equivalent released Effect artifact
exists, pnpm applies that source as a patch over the matching released package.

## Decision

Keep the Effect migration isolated on its development branch and configure one
Effect AI server with both `McpProtocol.v2026_07_28` and
`McpProtocol.v2025_06_18`.

Modern calls use `McpRequestContext`, which does not imply initialization or a
server-managed session. Legacy calls additionally receive `McpServerClient`,
preserving initialized-session behavior and server-to-client operations. Huly
tool exposure derives from the request profile common to both contexts, so
native/proxy selection works for modern per-request identity and legacy
initialized identity without duplicating dispatch logic.

The upstream source pin is reproducible and temporary:

- `effect`, `@effect/platform-node`, `@effect/platform-node-shared`, and
  `@effect/vitest` remain one exact `4.0.0-rc.109` cohort.
- `patches/effect@4.0.0-rc.109.patch` contains the selected source and compiled
  distribution changes needed by Node, Vitest, TypeScript, and the bundled
  release artifact.
- The patch carries a narrow compatibility overlay on that source. The
  canonical tool descriptor retains historical JSON Schema roots; the modern
  adapter projects them to its required object-root form, while the legacy
  adapter preserves authored compositions such as `anyOf`. Legacy tool titles
  remain under `annotations.title`, and registered legacy calls retain their
  pre-migration dispatch and error shape even when a tool is hidden from the
  current list response. These seams should move upstream or disappear with an
  equivalent release.
- `patches/effect-mcp-compatibility-overlay.patch` is the complete diff applied
  after checking out the selected source commit. Its digest is recorded in the
  source manifest. This separates upstream provenance from Huly compatibility
  decisions.
- `scripts/verify-effect-cohort.mjs` verifies the source manifest and installed
  dependency cohort. The manifest records the patch SHA-256 digest, and the
  verifier checks the repository patch bytes against it before checking the
  installed packages.
- Replace the patch with the first equivalent released Effect cohort after
  repeating the complete certification gate.

### Reproducible patch derivation

The package patch is derived in this order:

1. Clone the repository recorded in `patches/effect-mcp-source.json` and check
   out its recorded commit in detached-HEAD state.
2. Run `git apply patches/effect-mcp-compatibility-overlay.patch` from that
   checkout. The overlay patch applies directly to the recorded clean commit.
3. Install the source repository with its frozen pnpm lockfile, then run
   `pnpm --dir packages/effect build`.
4. Run `pnpm patch effect@4.0.0-rc.109` in Huly MCP. Replace that temporary
   package's `src` and `dist` trees with the built `packages/effect/src` and
   `packages/effect/dist` trees from step 3.
5. Run `pnpm patch-commit <temporary-package-path>`, then record the resulting
   package-patch SHA-256 in the source manifest.
6. Run `pnpm verify:effect-cohort`. This verifies both committed patch digests,
   the exact source identity, the installed dependency cohort, and the native
   compiler-service version.

## Consequences

Benefits:

- Modern-only clients can discover and call Huly without initialization.
- Modern HTTP calls are stateless and do not require sticky protocol sessions.
- Required routing headers, unsupported-version reporting, result type, cache
  policy, and server identity are provided by the upstream adapter.
- Existing `2025-06-18` clients keep their initialize/session exchange.
- One Effect-native registration and dispatch core serves both eras.

Drawbacks:

- The branch temporarily carries a large pnpm patch against an unstable Effect
  API and must be rebased or removed when upstream publishes equivalent code.
- Dependency installation and review include the patched Effect source and
  compiled output.
- HTTP concrete `resources/list` discovery remains disabled: registering
  request-scoped workspace identifiers in Effect's process-global resource
  registry would risk cross-workspace disclosure. Resource templates and reads
  remain request-scoped.
- Multi-round-trip input requests and subscriptions are available in the
  adapter but are not yet used by a Huly operation.

## Verification requirement

Before merge, certify mixed modern and legacy stdio/HTTP behavior, stateless
tool and resource operations, routing-header validation, modern result/cache
metadata, request-scoped credential isolation, packed artifacts, the local Huly
integration suite, and `pnpm check-all`.

## Certification evidence

Evidence recorded on 2026-08-18 for the isolated branch:

- The unchanged upstream dated adapter suites passed 276 tests with 9 skipped.
  This includes all 117 modern adapter tests for discovery, unsupported-version
  reporting, routing headers, multi-round-trip requests, and subscriptions.
- Huly's modern HTTP tests prove stateless discovery, tool listing and calls,
  resource-template listing, result/cache metadata, absence of protocol session
  identifiers, and distinct request client leases with independent cleanup.
- A live modern stdio client negotiated `2026-07-28` against local Huly, listed
  524 native tools, and called `get_huly_context` and `list_projects`.
- The local Huly integration suite passed 1,091 cases, failed 0, and skipped 28.
- `pnpm check-all` passed 4,148 tests with all coverage thresholds above 99%,
  and the legacy behavioral oracle remained byte-exact.
- Packed MCP and CLI artifacts passed dependency, bundle, and smoke
  certification.

Multi-round-trip requests and subscriptions are adapter capabilities rather
than Huly business operations. Their certification is therefore at the dated
adapter conformance boundary; no Huly tool currently exercises them.
