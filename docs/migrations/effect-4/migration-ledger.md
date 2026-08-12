# Effect 4 controlled-red migration ledger

Date: 2026-08-12
Target cohort: `4.0.0-rc.108`
Capture runtime: Node `22.22.2` (with the supported-line checks noted below on Node `24.15.0`)

This is the exhaustive, reproducible failure ledger immediately after replacing
the Effect 3 dependency graph. It is intentionally red: issue #211 changes only
the dependency/toolchain cohort, while later migration tickets repair the source.
Do not make `check-all` green by restoring Effect 3, adding compatibility facades,
suppressing diagnostics, or weakening a quality threshold. A later change is
within the controlled-red policy only when it removes entries below without
introducing a new category.

## Cohort and native-tool checks

| Check | Result | Evidence |
| --- | --- | --- |
| `mise exec node@22.22.2 -- pnpm verify:effect-cohort` | pass | Exact Effect RC and supporting-toolchain check passed. |
| `mise exec node@24.15.0 -- pnpm verify:effect-cohort` | pass | Same cohort check passed on the second supported Node line. |
| `mise exec node@22.22.2 -- pnpm exec effect-tsgo --version` | pass | Native executable started and printed `tsgo v0.36.4`. |
| `mise exec node@24.15.0 -- pnpm exec effect-tsgo --version` | pass | Native executable started and printed `tsgo v0.36.4`. |

Fresh temporary installs from the frozen lockfile also passed on both Node lines
on Linux arm64. The same `verify:effect-cohort` command runs immediately after
install in the Node 22.22.2 and 24.15.0 CI matrices; it now executes the native
tsgo binary as part of verification, covering the Linux x64 CI architecture as
well as dependency metadata.

The installed declarations and `node_modules/effect/AGENTS.md` agree with the
pinned source commits: exact rc.108 declarations remain authoritative,
`Schema.TaggedError` exists in this cohort, and the package guidance uses the v4
`Effect.gen`, `Effect.fn`, `Context.Service`, and unstable-module organization.
The pins needed no correction; `docs/mcps/effect.md` and `CLAUDE.md` were updated
to distinguish the recorded pre-cutover cohort from the now-installed target and
to put the shipped package guide into the active lookup order.

## Reproduction summary

Run these commands from the repository root after a clean cohort install. Preserve
full command output only as an untracked local artifact; the aggregates below are
the tracked ledger so compiler output does not add megabytes to the repository.

| Surface | Command | Result |
| --- | --- | --- |
| Bundle | `mise exec node@22.22.2 -- pnpm build` | fail, exit 1 |
| TypeScript | `mise exec node@22.22.2 -- pnpm typecheck:tsc` | fail, exit 1; 10,022 diagnostics in 538 files |
| Effect diagnostics | `timeout --signal=INT --kill-after=5s 120s mise exec node@22.22.2 -- pnpm typecheck:effect` | timeout, exit 124; no diagnostic payload before the bound |
| Tests | `mise exec node@22.22.2 -- pnpm test` | fail, exit 1; 252 files failed and 13 passed |

`pnpm check-all` is deliberately not run during this interval: its first build
stage is already represented by the focused build failure, and all later source
gates would be downstream noise until that failure is repaired.

## Build failure

The MCP bundle cannot resolve the removed package `@effect/platform` imported by
`src/mcp/http-transport.ts:10`. Because `build:mcp` fails first, `build:cli` does
not run. This is the complete build-stage failure at this cutover point.

## TypeScript failure inventory

The compiler emitted 10,022 diagnostics across 538 unique files: 5,718 in `src`
(324 files), 3,715 in `test` (172 files), 391 in `scripts` (29 files), and 198 in
`packages` (13 files). The diagnostic-code multiset below is exhaustive:

`TS1360` 1; `TS18046` 953; `TS18047` 5; `TS18048` 1; `TS2305` 68;
`TS2307` 10; `TS2314` 20; `TS2322` 338; `TS2339` 2,734; `TS2345` 1,131;
`TS2347` 187; `TS2352` 1; `TS2353` 11; `TS2366` 10; `TS2367` 24;
`TS2375` 1,404; `TS2379` 13; `TS2464` 9; `TS2488` 569; `TS2493` 1;
`TS2532` 2; `TS2551` 1,236; `TS2554` 279; `TS2560` 7; `TS2571` 141;
`TS2635` 3; `TS2678` 5; `TS2694` 18; `TS2698` 4; `TS2724` 105;
`TS2739` 21; `TS2740` 206; `TS2741` 12; `TS2769` 18; `TS7006` 436;
`TS7031` 30; `TS7053` 9.

These diagnostics collapse into the following migration categories. Cascading
`unknown`, assignability, iterator, and implicit-`any` errors are retained in the
code multiset above and should disappear only through the owning API migrations.

| Category | Representative evidence | Required migration family |
| --- | --- | --- |
| Removed packages/exports | 8 `@effect/cli` and 2 `@effect/platform` unresolved-module diagnostics; `NodeContext` absent | CLI to `effect/unstable/cli`, HTTP to `effect/unstable/http`, `NodeContext` to `NodeServices` |
| Schema construction and metadata | `annotations` 1,151; `optionalWith` 112; `extend` 24; old variadic `Literal`/`Union`; removed filters such as `positive` | v4 schema constructors, `.annotate`, `optionalKey`, field composition, array-based members, current checks |
| Schema parse/encode and JSON Schema | `decodeUnknown` 681; `decodeUnknownEither` 130; `encodeUnknown` 36; `JSONSchema` 83; `ParseResult` 13 | Result/effect parsers and encoders plus the project Draft-07 adapter |
| Services, layers, config, and yielding | `Context.Tag` 10; service values not iterable; `Effect`/service environment mismatches; removed config APIs | `Context.Service`, v4 Layer composition/memoization, current Config provider/schema APIs |
| Effect combinators and runtime | `either` 151; `fork` 19; `catchAll` 4; `zipRight` 2; logger/console APIs | v4 Result/error, fiber, sequencing, logging, and runtime APIs |
| Cause/Exit failures | removed `isDie`, `isFailType`, `sequential`, fiber-failure symbols, and old cause fields | centralized flattened `Cause.reasons` and explicit `Exit` interpretation |
| Test APIs | old `@effect/vitest` assumptions and `TestClock` import failures | `effect/testing`, v4 Effect Vitest test shape, explicit layer isolation |

To regenerate the exact counts without retaining the raw log:

```bash
mise exec node@22.22.2 -- pnpm typecheck:tsc > /tmp/hulymcp-effect4-tsc.log 2>&1
rg -o 'error TS[0-9]+' /tmp/hulymcp-effect4-tsc.log | sort | uniq -c
rg -o '^(src|packages|scripts|test)/[^(:]+' /tmp/hulymcp-effect4-tsc.log | sort -u | wc -l
```

## Effect diagnostic timeout

`effect-tsgo diagnostics` starts successfully but produces no diagnostics or
completion within 120 seconds and is interrupted by the explicit bound (exit
124). Its native binary itself starts on both supported Node lines, so this is a
project-analysis timeout distinct from native executable startup. Keep this entry
red until the compiler migration surface is reduced enough for diagnostics to
complete; do not remove the Effect diagnostic gate or lower its severity.

## Test failure inventory

Vitest completes in about 36 seconds: 252 of 265 files fail, 13 pass; 139 tests
execute, with 136 passing and 3 failing. Of the failed files, 250 are suite import
or collection failures. Their observed root-error inventory is:

| Root failure | Observed count |
| --- | ---: |
| Undefined schema value followed by `.annotations` | 111 |
| Undefined schema value followed by `.ast` | 10 |
| Missing `@effect/cli` package | 6 |
| `Schema.Literal(...).annotations` is absent | 5 |
| Old union member call (`members.map` failure) | 2 |
| `Schema.optionalWith` is absent | 2 |
| `Context.Tag` is absent | 2 |
| Missing `@effect/platform` package | 1 |
| Other schema startup roots (`finite`, undefined `pipe`/`encoding`) | 3 |

The three executed assertion failures are also migration-owned:

- two property-harness tests call removed `Schema.decodeUnknownEither`;
- the CLI defect-boundary test receives exit status 1 instead of the preserved
  status 70 because the old Cause/runtime interpretation no longer applies.

The 142 root-error lines are not a count of failed files. A single collection
root is imported through the test module graph and therefore accounts for many
failed suites without Vitest emitting another root error for every importer. All
250 collection failures belong to that import-graph fan-out; every distinct root
error Vitest emitted is classified above, so there are no 108 unassigned failure
families.

The suite counts, test names, and root errors can be refreshed with:

```bash
mise exec node@22.22.2 -- pnpm test > /tmp/hulymcp-effect4-test.log 2>&1
rg '^TypeError:|^Error: Cannot find package' /tmp/hulymcp-effect4-test.log | sort | uniq -c
tail -n 12 /tmp/hulymcp-effect4-test.log
```

## Ticket #212 testing-primitives delta

The first v4-native testing slice now passes independently:

```bash
mise exec node@22.22.2 -- pnpm exec vitest run \
  test/effect4/testing-primitives.test.ts \
  test/effect4/layer-isolation.test.ts
```

Result: 2 files and 5 tests pass. These tests establish automatic `it.effect`
scopes, virtual-clock advancement, explicit readiness, deferred versus eager
fiber startup, deterministic scoped interruption, shared layer memoization, and
the `Layer.fresh` isolation choice; the guidance also records when whole-subtree
`local: true` isolation is appropriate. Direct compiler output has
no diagnostics in either new file. The global build, compiler, Effect diagnostic,
and test-suite categories above remain unchanged; #212 deliberately does not
bulk-convert the 250 migration-blocked test suites.

## Ticket #213 schema-foundation delta

The central Draft-07 adapter and shared Schema foundation pass independently:

```bash
mise exec node@22.22.2 -- pnpm exec vitest run \
  src/domain/schemas/json-schema.test.ts \
  test/domain/schemas/shared-identifiers.test.ts \
  test/domain/schemas.shared-foundation.test.ts \
  test/effect4/optionality-tracer.test.ts \
  test/mcp/input-schema-compat.test.ts \
  test/mcp/input-schema-compat.property.test.ts \
  test/mcp/json-schema-refs.test.ts
```

Result: 7 files and 31 tests pass, including external AJV Draft-07 validation,
input and output schemas, definitions and nested refs, tuples, authored `oneOf`,
authored boolean constraints, closed public objects, preserved v3 empty-params
runtime behavior, exact and ordinary optionality, and runtime/encoding edge cases.
Strict per-file Effect diagnostics report zero findings across the owned source
and test files. `shared.ts` was split behind its stable barrel to keep every
production file below the 420-line architecture limit.

The compiler inventory falls from 10,022 diagnostics in 538 files to 9,325 in
504 files: 5,898 in `src` (310 files), 2,858 in `test` (150 files), 368 in
`scripts` (31 files), and 201 in `packages` (13 files). The remaining global
build, domain Schema, CLI, service, Cause/Exit, and test collection categories
remain assigned to later tickets. Complete registry JSON Schema parity remains
deferred until every domain-owned generator has moved through the sole adapter.

## Ticket #214 Cause/Exit seam delta

The flattened Cause interpreter and CLI process boundary pass independently:

```bash
mise exec node@22.22.2 -- pnpm exec vitest run \
  test/runtime/cause-exit.test.ts \
  test/runtime/schema-error-format.test.ts \
  test/cli/process-failures.test.ts
```

Result: 3 files and 18 tests pass. The matrix covers successful and failed
`runPromiseExit` boundaries, typed failures, defects, interruption, empty and
multiple ordered reasons, Effect 3-compatible parse-error wording, and
process-level sanitization. Client acquisition now resolves with `Exit`;
production code no longer recognizes or renders a FiberFailure wrapper. The
neutral client-resolver port and protocol/server callbacks now carry that Exit
contract. The MCP mapping, resource, registry, and client-runtime suites remain
collection-blocked before their tests run by already-assigned domain Schema and
service declaration failures (`Schema.Union`, removed filter combinators, and
v3 `Context.Tag` shapes).
The blocked client-runtime suite contains the focused unavailable-eviction,
non-recoverable caching, and priming-race assertions for when #215 unlocks its
imports.

The compiler inventory falls from 9,325 diagnostics in 504 files to 9,257 in
501 files: 5,861 in `src` (312 files), 2,861 in `test` (147 files), 368 in
`scripts` (31 files), and 167 in `packages` (11 files). The neutral resolver and
compatibility formatter add no owned-scope compiler failures. Remaining service
declaration diagnostics belong to #215; remaining test diagnostics include
Exit-consumer updates assigned to their domain and lifecycle tickets.

## Ledger maintenance rule

Every migration batch must rerun the focused surface it owns and update this
file in the same change. Counts may fall and categories may be removed. A new
error code, root runtime failure, build blocker, timeout, or test-failure family
must be explained and assigned before the batch is considered within the
controlled-red policy. Full `pnpm check-all` becomes mandatory again once its
build and typecheck stages can complete.
