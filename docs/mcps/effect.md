# Effect reference sources

This project keeps an exact target source checkout for active Effect work and an
archival pre-cutover snapshot for parity provenance. The checkouts are ignored
local reference material; this tracked document records their reviewed refs.

## Reference corpus

| Purpose | Local path | Upstream ref | Commit |
| --- | --- | --- | --- |
| Historical Effect 3 parity evidence | `.reference/effect-v3.22.1/` | `effect@3.22.1` | `417e0faa80e471d77fc4a67452e68b09ae0ee861` |
| Active Effect 4 target source | `.reference/effect-v4.0.0-rc.108/` | `effect@4.0.0-rc.108` | `bef7bf38ae4b73d5511043f707aed083de5da7cc` |
| Official agent workflows | `.reference/effect-skills/` | `Effect-TS/skills` `main`, reviewed pin | `28822c9e19998876a6b0e0d97877442012ed4391` |

The Effect 3 monorepo tag does not represent the exact release combination of
every independently versioned package in the pre-cutover lockfile. The migration
baseline used:

- `effect@3.22.1`
- `@effect/cli@0.73.2`
- `@effect/platform@0.94.5`
- `@effect/platform-node@0.104.1`
- `@effect/vitest@0.30.0`

That list is migration provenance, not the current installation. The installed
target cohort is:

- `effect@4.0.0-rc.108`
- `@effect/platform-node@4.0.0-rc.108`
- `@effect/vitest@4.0.0-rc.108`
- `@effect/tsgo@0.36.4`

`@effect/cli` and `@effect/platform` are intentionally absent as direct target
dependencies. Their APIs moved into the core package, including
`effect/unstable/cli` and `effect/unstable/http`; use the exact import map for
symbol-level replacements. `@effect/platform-node` remains a separate package.

There is intentionally no ambiguous `.reference/effect` alias. Choose the source
generation explicitly in every search.

## Authority and lookup order

For current Effect work, use evidence in this order:

1. The exact package declarations installed by the lockfile for current behavior.
2. The pinned v4 topic guides and source for implementation patterns.
3. The consumer guidance shipped as `node_modules/effect/AGENTS.md` in the exact
   installed v4 package.
4. The release announcement and project research note for rationale only.

Exact pinned package and source declarations override generic or globally installed
skills. The installed `AGENTS.md` is generated consumer guidance; the pinned
source's `.agents/AGENTS.md` contains instructions for contributors to Effect
itself and does not replace this project's instructions. This matters for
`4.0.0-rc.108`: the installed guide and declarations use `Schema.TaggedError`,
even though newer generic guidance may describe a different name.

The installed rc.108 declarations also confirm the current surfaces used by
this project: class-style `Context.Service<Self, Shape>()`,
`Schema.toJsonSchemaDocument` with `JsonSchema.toDocumentDraft07`,
`Effect.runPromiseExit`, the flat `Cause.reasons` representation, and the
`effect/unstable/cli` and `effect/unstable/process` package exports. Search the
installed declarations before applying any of these patterns; this list is a
provenance checkpoint, not a substitute for exact signatures.

Before editing Effect code, read the relevant project instructions and search the
smallest applicable installed declaration or pinned v4 source region. Escalate to
a topic guide and then exact v4 source when a pattern is structural or ambiguous.
The recorded v3 cohort is historical parity evidence, not active implementation
guidance.

## Setup and refresh

From the canonical checkout, create or verify the active pinned v4 source and
general Effect workflow repositories with:

```bash
bash scripts/setup-effect-references.sh
```

The command stages each new clone in a temporary directory and moves it into
place only after checkout. It never rewrites an existing repository. An existing
checkout with the wrong origin or commit, local changes, or an ambiguous
`.reference/effect` path causes a failure that must be inspected manually.

Use the network-free verification mode in routine checks and before starting
Effect work:

```bash
bash scripts/setup-effect-references.sh --check
```

The active Effect source tree is an immutable snapshot. Do not `git pull` it.
Changing that snapshot is a dependency and specification decision that requires
updating the constants in the setup script and this document together. The
historical v3 snapshot is no longer provisioned or verified by the setup command.

The skills repository is moving guidance, but this project uses the recorded
commit rather than a moving branch. To consider an update, fetch and review it
without changing the checked-out pin:

```bash
git -C .reference/effect-skills fetch origin main
git -C .reference/effect-skills diff HEAD..origin/main
```

Adopting that update requires changing the reviewed commit in both the setup
script and this document. Do not merge moving `main` into the reference checkout.

Secondary worktrees receive the local reference corpus through
`bash scripts/bootstrap-worktree.sh`, which links the complete `.reference`
directory from the canonical checkout.

The v3 snapshot and reviewed commit remain historical parity evidence; they are
not part of the active lookup order. Keep or replace the v4 snapshot only
alongside an explicit Effect version change.
