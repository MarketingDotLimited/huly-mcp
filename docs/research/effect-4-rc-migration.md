# Effect 4 RC migration research
Date: 2026-08-12

## Question and conclusion

This note records the migration facts needed to move Huly MCP from Effect 3 to the
Effect 4 release-candidate line without changing its public MCP or CLI contracts.

The recommended target is the **exact `4.0.0-rc.108` cohort**, not a floating
`@rc` tag or caret range. Effect's release announcement says the interfaces are
"presumed final", but explicitly asks applications to expose regressions,
compatibility gaps, and performance problems before stable. That makes this a
compatibility migration, not permission to redesign the product surface.
([Effect 4 RC announcement](https://effect.website/blog/releases/effect/40-rc/))

The migration should therefore preserve, and compare against a captured baseline
for:

- Draft-07 MCP input and output schemas, including references, required fields,
  descriptions, `additionalProperties`, and authored `oneOf` / `anyOf` / `not`
  constraints;
- tool discovery inventory, descriptions, and invalid-parameter responses;
- CLI routes, help, structured-input precedence and ordering, and text/JSON error
  rendering;
- stdio and HTTP transport acquisition, request, interruption, and shutdown
  behavior; and
- error sanitization at every Promise/protocol boundary.

This recommendation is based on exact package artifacts and source at Effect
commit [`bef7bf38`](https://github.com/Effect-TS/effect/commit/bef7bf38ae4b73d5511043f707aed083de5da7cc),
the commit behind all `4.0.0-rc.108` Effect package tags. Current `main` migration
guidance is useful, but the tagged source and declarations are authoritative when
they disagree.

## Facts: package cohort, runtime floor, and tooling

Effect v4 publishes ecosystem packages as a coordinated version cohort, and its
official migration overview says remaining separate packages must be bumped with
`effect`. It also says that consolidated packages moved into `effect`, while
unstable APIs live under `effect/unstable/*`.
([migration overview](https://github.com/Effect-TS/effect/blob/main/MIGRATION.md))

The npm artifacts establish this exact compatibility set:

| Package | Exact version | Relevant published metadata |
| --- | --- | --- |
| `effect` | `4.0.0-rc.108` | Exports `effect/testing`, `effect/unstable/cli`, and `effect/unstable/http`. ([manifest at the RC commit](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/package.json#L25-L42), [npm metadata](https://registry.npmjs.org/effect/4.0.0-rc.108)) |
| `@effect/platform-node` | `4.0.0-rc.108` | Peers on `effect ^4.0.0-rc.108` and `ioredis >=5.7.0 <6.0.0`; depends on `undici ^8.7.0`. ([manifest](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/platform/node/package.json#L68-L82), [npm metadata](https://registry.npmjs.org/@effect%2fplatform-node/4.0.0-rc.108)) |
| `@effect/vitest` | `4.0.0-rc.108` | Peers on `effect ^4.0.0-rc.108` and `vitest >=4.1.0 <5.0.0`. ([manifest](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/vitest/package.json), [npm metadata](https://registry.npmjs.org/@effect%2fvitest/4.0.0-rc.108)) |
| `@effect/tsgo` | `0.36.4` | Publishes platform-specific optional packages for Linux, macOS, and Windows at the same version. ([npm metadata](https://registry.npmjs.org/@effect%2ftsgo/0.36.4)) |
| `vitest` / `@vitest/coverage-v8` | `4.1.10` | The coverage package peers on the exact Vitest version; Vitest accepts Node `^20 || ^22 || >=24`. ([Vitest metadata](https://registry.npmjs.org/vitest/4.1.10), [coverage metadata](https://registry.npmjs.org/@vitest%2fcoverage-v8/4.1.10)) |

There is a material engine-metadata mismatch in the platform dependency graph.
`@effect/platform-node@4.0.0-rc.108` declares Node `>=18`, but its direct
`undici ^8.7.0` dependency resolves to a line whose `8.7.0` package requires Node
`>=22.19.0`.
([platform manifest](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/platform/node/package.json#L28-L30),
[Undici 8.7.0 metadata](https://registry.npmjs.org/undici/8.7.0))

### Recommendations

- Set the project engine to `^22.22.2 || ^24.15.0`. The dependency-imposed fact
  is only Node `>=22.19.0`; the narrower pair is a project support policy that
  selects the current Node 22 and 24 lines and matches the policy already exercised
  by `../dalph/package.json`.
- Pin `effect`, `@effect/platform-node`, and `@effect/vitest` exactly to
  `4.0.0-rc.108`. Their peer ranges would technically accept later RCs, but an
  exact pin prevents an unreviewed RC from entering a contract-parity migration.
- Remove `@effect/cli` and `@effect/platform`. The official import map moves CLI
  to `effect/unstable/cli`, core platform services into `effect`, and HTTP to
  `effect/unstable/http`.
  ([official import map](https://github.com/Effect-TS/effect/blob/main/migration/v3-to-v4.md#effectcli),
  [platform mapping](https://github.com/Effect-TS/effect/blob/main/migration/v3-to-v4.md#effectplatform))
- Add an exact compatible `ioredis` version, currently `5.11.1`, while it remains
  a non-optional platform-node peer. The application need not use Redis for the
  peer requirement to exist.
- Pin `@effect/tsgo@0.36.4`, `vitest@4.1.10`, and
  `@vitest/coverage-v8@4.1.10`; reinstall on the actual build architecture so
  the matching native tsgo package and esbuild binary are selected.
- After reinstalling, verify whether `scripts/prepare-effect-tsgo.mjs` is still
  required. Its comment and behavior are specifically a workaround for
  `@effect/tsgo@0.24.3`; delete it only after the `0.36.4` binary launches with
  correct executable permissions.
- Make a lockfile check assert that only the selected Effect RC cohort is present.

The current baseline at commit
[`ffdb965a`](https://github.com/dearlordylord/huly-mcp/commit/ffdb965a66f635eabbba65e51f061606b13b49cb)
still declares Node `>=20`, `effect ^3.19.15`, independently versioned
`@effect/cli`, `@effect/platform`, and `@effect/platform-node`, and floating
Vitest packages. See [`package.json`](../../package.json) and
[`pnpm-lock.yaml`](../../pnpm-lock.yaml).

## Facts: Schema and JSON Schema

Effect 4's schema model changes both syntax and semantics. The official Schema
guide maps, among other changes:

- `.annotations(...)` to `.annotate(...)`;
- variadic `Union` and multi-value `Literal` to array-based `Union([...])` and
  `Literals([...])`;
- `Record({ key, value })` to `Record(key, value)`;
- `extend` to struct field mapping/assignment;
- `transform` / `transformOrFail` to `decodeTo` plus getters or a schema
  transformation;
- `optionalWith(schema, { exact: true })` to `optionalKey(schema)`; and
- `ParseResult` formatting/construction to `SchemaError` / `SchemaIssue` APIs.

It also records that `positive`, `negative`, `nonNegative`, and `nonPositive`
were removed.
([official Schema migration guide](https://github.com/Effect-TS/effect/blob/main/migration/schema.md))

Exact `rc.108` source confirms that:

- `Schema.optionalKey` models an absent-or-present key without automatically
  adding `undefined`, while `Schema.optional` is explicitly equivalent to
  `optionalKey(UndefinedOr(schema))`;
  ([RC source](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Schema.ts#L2377-L2484))
- pure parsing can use `Schema.decodeUnknownResult`;
  ([RC source](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Schema.ts#L1745-L1764))
- transformations are represented by `decodeTo`, with `SchemaGetter`-based
  decode/encode functions;
  ([RC source](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Schema.ts#L5549-L5592))
- `Schema.toJsonSchemaDocument` always returns a Draft 2020-12 document;
  ([RC source](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Schema.ts#L14888-L14915))
  and
- the core `JsonSchema.toDocumentDraft07` API converts that canonical document
  to Draft-07, rewriting references and tuple keywords and dropping unsupported
  Draft 2020-12 keywords.
  ([RC source](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/JsonSchema.ts#L499-L548))

There is an important guide-versus-cohort discrepancy: the current migration
table says `Schema.TaggedError` was renamed to `TaggedErrorClass`, but exact
`rc.108` still exports and documents `Schema.TaggedError`.
([guide entry](https://github.com/Effect-TS/effect/blob/main/migration/schema.md#renames),
[RC export](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Schema.ts#L14488-L14551))
For this cohort, retaining `Schema.TaggedError` is the source-backed decision.

### Recommendation: one project-owned Draft-07 adapter

Introduce a single internal adapter that:

1. calls `Schema.toJsonSchemaDocument`;
2. calls `JsonSchema.toDocumentDraft07`;
3. emits the existing MCP root shape, including the definitions collection and
   existing wrapper/reference compatibility behavior; and
4. is the only path by which application Schema becomes public JSON Schema.

This adapter is a compatibility seam, not a custom reimplementation of dialect
conversion. Its tests should compare a normalized pre-migration corpus and cover
`$ref`, definitions, tuple conversion, omission/required behavior, descriptions,
`additionalProperties`, and authored boolean/composition constraints. Because the
official converter documents that unsupported newer keywords are dropped, every
intentional corpus delta requires review.

Do not convert every `Schema.optional` mechanically. Preserve its existing
absent-or-explicit-`undefined` contract unless a field currently uses
`optionalWith(..., { exact: true })`, in which case `optionalKey` is the direct
semantic replacement. Test absent keys, explicit `undefined`, `null`, and encoded
omission separately.

## Facts: services, layers, configuration, and runtime

The official service guide replaces `Context.Tag` with `Context.Service`; exact
RC source also exposes `Context.Service.Shape<typeof Service>` for retrieving a
service's shape.
([service guide](https://github.com/Effect-TS/effect/blob/main/migration/services.md),
[RC `Context.Service`](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Context.ts#L174-L233),
[RC `Service.Shape`](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Context.ts#L347-L407))

Other official mappings relevant to this repository are:

- `Layer.scoped` to `Layer.effect`;
- `Scope.extend` to `Scope.provide`;
- `ConfigProvider.fromMap` to `fromUnknown` after expanding delimited keys;
- `Config.integer` to `Config.int`;
- `Config.validate` to Schema checks used by `Config.schema`;
- `Effect.withConfigProvider` to providing the `ConfigProvider.ConfigProvider`
  service;
- `Effect.catchAll` to `Effect.catch`;
- `Effect.dieMessage` to `Effect.die` with an explicit defect; and
- `Effect.either` to `Effect.result`.

([API rename map](https://github.com/Effect-TS/effect/blob/main/migration/v3-to-v4.md),
[Scope guide](https://github.com/Effect-TS/effect/blob/main/migration/scope.md),
[error-handling guide](https://github.com/Effect-TS/effect/blob/main/migration/error-handling.md))

Effect 4 also shares Layer memoization across separate `Effect.provide` calls.
`{ local: true }` or `Layer.fresh` restores isolated acquisition when a test or
stateful resource needs it.
([official memoization guide](https://github.com/Effect-TS/effect/blob/main/migration/layer-memoization.md))

### Recommendation

Migrate the service declarations and their `Service["Type"]` consumers as one
expand/migrate/contract track. Prefer already-declared internal operation
interfaces when they are the service shape; otherwise use
`Context.Service.Shape<typeof Service>`. Add acquisition-count tests before
changing stateful test layers so new shared memoization cannot silently merge
fixtures that were isolated under v3.

Configuration should remain a boundary parser: construct a provider once, parse
into the schema-owned config type, retain redaction, and preserve existing empty
value/default/error behavior.

## Facts: Cause, Exit, and Promise boundaries

Effect 4 flattens `Cause<E>` into a `reasons` array of Fail, Die, or Interrupt
reasons. Sequential and parallel composition no longer have distinct tree nodes;
both old constructors map to `Cause.combine`.
([official Cause guide](https://github.com/Effect-TS/effect/blob/main/migration/cause.md),
[RC Cause model](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Cause.ts#L41-L78),
[RC `combine`](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Cause.ts#L669-L695))

The v3 `Runtime<R>` container is removed; run functions live on `Effect`. Exact
RC source exposes `Effect.runPromiseExit`, which returns an `Exit` rather than
rejecting.
([runtime guide](https://github.com/Effect-TS/effect/blob/main/migration/runtime.md),
[RC `runPromiseExit`](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Effect.ts#L8992-L9014))

### Recommendation: one Cause/Exit interpretation seam

Centralize helpers that inspect `cause.reasons`, select typed failures, detect
defects and interruption, and render the existing sanitized MCP/CLI error. At
JavaScript Promise boundaries use `runPromiseExit` and inspect `Exit` directly;
do not make protocol behavior depend on catching a framework-specific FiberFailure
wrapper. Replace Cause tree tests with reason-array/`Cause.combine` assertions,
while preserving deterministic typed-error ordering where callers observe it.

The highest-risk existing consumers are `src/mcp/error-mapping.ts`,
`src/mcp/protocol-resource-handlers.ts`, `src/mcp/tools/operation-failure.ts`, and
`src/runtime/huly-clients.ts`.

## Facts: CLI, Node platform, HTTP, and tests

The official import map moves:

- `@effect/cli/Args`, `Command`, and `Options` to `Argument`, `Command`, and
  `Flag` under `effect/unstable/cli`;
- `@effect/cli/ValidationError` to `CliError`;
- `@effect/platform/HttpApp` to `effect/unstable/http/HttpEffect` and the other
  HTTP modules to the same unstable HTTP namespace; and
- `NodeContext` to `NodeServices`, whose aggregate layer provides child process,
  crypto, filesystem, path, stdio, and terminal services.

The map also says the old `Usage` ADT is removed and maps `CommandDescriptor` to
completion support, not to an equivalent public command-tree introspection API.
([CLI import map](https://github.com/Effect-TS/effect/blob/main/migration/v3-to-v4.md#effectcli),
[HTTP import map](https://github.com/Effect-TS/effect/blob/main/migration/v3-to-v4.md#effectplatform),
[NodeContext mapping](https://github.com/Effect-TS/effect/blob/main/migration/v3-to-v4.md#effectplatform-nodenodecontext),
[RC `NodeServices`](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/platform/node/src/NodeServices.ts#L28-L48))

Exact `@effect/vitest@rc.108` exposes `it.effect`, whose test Effect already
includes `Scope`, and Effect exports `TestClock` from `effect/testing`.
([RC Vitest source](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/vitest/src/index.ts#L90-L110),
[RC testing barrel](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/testing/index.ts))
Forking guidance maps `Effect.fork` to `forkChild`; fork variants now accept a
`startImmediately` option.
([official forking guide](https://github.com/Effect-TS/effect/blob/main/migration/forking.md),
[RC `forkChild`](https://github.com/Effect-TS/effect/blob/bef7bf38ae4b73d5511043f707aed083de5da7cc/packages/effect/src/Effect.ts#L8455-L8490))

### Recommendations

- Treat the CLI as a tracer-bullet migration, not an import-only rewrite. Keep
  `packages/huly-cli/src/catalog.ts` as the source of truth for routes and help.
  Preserve the application-owned raw-argv handling in
  `packages/huly-cli/src/input.ts`, especially repeated `--input-json` /
  `--input-file` ordering, presence versus defaults, and explicit-field
  precedence. Replace HelpDoc/descriptor introspection from catalog data, and
  keep the existing error boundary as the only renderer.
- Reconstruct `src/mcp/http-transport.ts` around the v4 router/layer APIs and
  verify ownership of the Node listener, request scopes, MCP server instances,
  concurrent requests, and shutdown. The `HttpApp` to `HttpEffect` rename is
  evidence of a changed model, not merely a symbol rename.
- Replace `it.scoped` with `it.effect`, import `TestClock` from `effect/testing`,
  and audit every fork for child ownership and whether immediate startup is
  required. Keep tests deterministic through Effect synchronization primitives.

## Measured Huly MCP blast radius

The following is a textual inventory of the current checkout at
`ffdb965a66f635eabbba65e51f061606b13b49cb`. Counts include `src`, `test`,
`scripts`, and `packages` unless a narrower scope is stated. They are planning
signals rather than a claim that every match needs a hand edit.

| Surface | Current measurement |
| --- | ---: |
| TypeScript files containing `Schema` | 322 |
| Production `JSONSchema.make` calls | 479 calls in 82 files |
| `Schema.optional` calls | 1,460 calls in 102 files |
| textual `optionalWith(...)` uses with `exact: true` on the same line | 74 calls in 21 files |
| `Context.Tag` declarations/usages | 9 in 9 files |
| `Service["Type"]` references | 398 in 107 files |
| `Schema.TaggedError` declarations/usages | 275 in 38 files |
| `decodeUnknownEither` references | 129 in 36 files |
| `ParseResult` references | 57 in 13 files |
| `Effect.fork` references | 19 in 3 files (14 in `test/mcp/server.test.ts`) |
| `it.scoped` references | 55 in 4 files (42 in `test/mcp/server.test.ts`) |
| `Cause.sequential` / `Cause.parallel` references | 5 in 3 files |
| `@effect/platform` imports | 12 in 11 files |
| `@effect/cli` imports | 3 in 3 files |
| CLI parity contract | 522 registry operations; 451 CLI routes in the recorded baseline |
| Huly domain error schema | 190 runtime union members |

Representative counting commands:

```bash
rg -l '\bSchema\b' src test scripts packages --glob '*.ts' | sort -u | wc -l
rg -o 'JSONSchema\.make' src --glob '*.ts' | wc -l
rg -l 'JSONSchema\.make' src --glob '*.ts' | wc -l
rg -o '\["Type"\]' src test scripts packages --glob '*.ts' | wc -l
rg -o 'Schema\.TaggedError' src test scripts packages --glob '*.ts' | wc -l
pnpm exec tsx -e 'import { HulyDomainError } from "./src/huly/errors-domain.ts"; console.log(HulyDomainError.ast.types.length)'
```

The 522/451 CLI figures are checked-in contract data in
[`packages/huly-cli/src/parity-contract.ts`](../../packages/huly-cli/src/parity-contract.ts),
not a regex estimate. `test/mcp/server.test.ts` is a 2,236-line concurrency and
lifecycle hotspot. The JSON Schema fan-out is the strongest reason to establish
one adapter before mechanical Schema edits.

## Local implementation evidence from `../dalph`

`../dalph` is useful implementation precedent, not an authority for this
migration. Its root package currently uses `effect@4.0.0-beta.106` and
`@effect/vitest@4.0.0-beta.106`, so its version pins must not be copied.

It does demonstrate working project patterns for:

- `Context.Service` declarations throughout
  `../dalph/packages/orchestrator/src/`;
- `Schema.optionalKey` at external boundaries such as
  `../dalph/packages/orchestrator/src/authorities/task-tracker/github/graph-schema.ts`;
- `effect/unstable/cli` in
  `../dalph/packages/dalph/src/application/cli.ts`;
- `NodeServices.layer` in production and tests; and
- `TestClock` from `effect/testing` plus direct `runPromiseExit` / flat
  `cause.reasons` inspection.

Its Node engine policy is the source of the recommended
`^22.22.2 || ^24.15.0` project range, while the minimum enforced by Huly MCP's
new dependency graph comes independently from Undici.

## Decisions to carry into the specification and tickets

1. Behavioral parity is the governing objective; no intended MCP or CLI
   contract change is bundled into the Effect migration.
2. Use exact `4.0.0-rc.108` Effect package pins and a single lockfile cohort.
3. Raise the Node support policy to `^22.22.2 || ^24.15.0` and validate clean
   installs and the full harness on both lines.
4. Establish three explicit migration seams before broad edits:
   a Draft-07 JSON Schema adapter, a Cause/Exit interpretation module, and
   catalog-owned CLI route/help metadata.
5. Preserve ordinary optional-field behavior; use `optionalKey` for existing
   exact optionals and test absence, explicit `undefined`, `null`, and encoding.
6. Retain `Schema.TaggedError` for the exact RC despite the current guide's
   stale `TaggedErrorClass` rename entry.
7. Run CLI and HTTP transport as separate tracer bullets before mechanical
   bulk migration, then finish with full MCP/CLI schema corpus comparison,
   `pnpm check-all`, bundle/packed-CLI checks, and local-Huly stdio and HTTP
   integration tests.
