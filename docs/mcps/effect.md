# Effect reference sources

This project keeps the source generation being migrated from and the exact target
generation side by side. The checkouts are ignored local reference material; this
tracked document records the refs that every migration worktree must use.

## Reference corpus

| Purpose | Local path | Upstream ref | Commit |
| --- | --- | --- | --- |
| Effect 3 core semantics | `.reference/effect-v3.22.1/` | `effect@3.22.1` | `417e0faa80e471d77fc4a67452e68b09ae0ee861` |
| Effect 4 target and migration guides | `.reference/effect-v4.0.0-rc.108/` | `effect@4.0.0-rc.108` | `bef7bf38ae4b73d5511043f707aed083de5da7cc` |
| Official agent workflows | `.reference/effect-skills/` | `Effect-TS/skills` `main`, pinned for this migration | `28822c9e19998876a6b0e0d97877442012ed4391` |

The Effect 3 monorepo tag does not represent the exact release combination of
every independently versioned package in the current lockfile. For those packages,
the installed sources in `node_modules` are authoritative:

- `effect@3.22.1`
- `@effect/cli@0.73.2`
- `@effect/platform@0.94.5`
- `@effect/platform-node@0.104.1`
- `@effect/vitest@0.30.0`

There is intentionally no ambiguous `.reference/effect` alias. Choose the source
generation explicitly in every search.

## Authority and lookup order

During the v3-to-v4 migration, use evidence in this order:

1. The exact package declarations installed by the lockfile for current behavior.
2. The pinned v4 migration map, topic guides, and source for replacements.
3. `node_modules/effect/AGENTS.md` after the exact v4 cohort is installed.
4. The pinned official `effect-v3-to-v4` workflow under `effect-skills` for lookup
   discipline.
5. The pinned v3 source and installed v3 satellite packages for old semantics.
6. The release announcement and project research note for rationale only.

Exact pinned package and source declarations override generic or globally installed
skills. This matters for `4.0.0-rc.108`: it still exports `Schema.TaggedError`, even
though newer guidance may describe a different name.

Before editing Effect code, read the relevant project instructions and search the
smallest applicable upstream source region. Read the v4 `MIGRATION.md` once, then
search `migration/v3-to-v4.md` by symbol or module. Never load that generated file
whole; it is too large for a useful implementation context. Escalate to a topic
guide and then exact v4 or v3 source when a mapping is structural or ambiguous.

## Setup and refresh

From the canonical checkout, create any missing repositories and verify the
complete corpus with:

```bash
bash scripts/setup-effect-references.sh
```

The command stages each new clone in a temporary directory and moves it into
place only after checkout. It never rewrites an existing repository. An existing
checkout with the wrong origin or commit, local changes, or an ambiguous
`.reference/effect` path causes a failure that must be inspected manually.

Use the network-free verification mode in routine checks and before starting a
migration ticket:

```bash
bash scripts/setup-effect-references.sh --check
```

The two Effect source trees are immutable snapshots. Do not `git pull` them.
Changing either snapshot is a dependency and specification decision that requires
updating the constants in the setup script and this document together.

The skills repository is moving guidance, but this migration uses the recorded
commit rather than a moving branch. To consider an update, fetch and review it
without changing the checked-out pin:

```bash
git -C .reference/effect-skills fetch origin main
git -C .reference/effect-skills diff HEAD..origin/main
```

Adopting that update requires changing the reviewed commit in both the setup
script and this document. Do not merge moving `main` into the reference checkout.

Secondary worktrees receive all three repositories through
`bash scripts/bootstrap-worktree.sh`, which links the complete `.reference`
directory from the canonical checkout.

Keep the v3 snapshot through final parity certification. After the migration is
released, removing it is a separate cleanup decision. Keep or replace the v4
snapshot only alongside an explicit Effect version change.
