# Effect 4 behavioral-oracle delta review

The immutable Effect 3 baseline remains
`docs/migrations/effect-4/behavioral-oracle.json`. The Effect 4 comparison was
captured independently after the #227 and #228 bundled builds became runnable;
the baseline was not regenerated.

## Reviewed corpus identity

- Effect 3 baseline SHA-256:
  `02bb5e4bf2fdb0e4dd30f980810bd0fe70d5c91482c309b4621264c373d6adac`
- Reviewed Effect 4 corpus SHA-256:
  `8692c3202b57dffabc838d555292fe47bb9a01f3fb0113fd1ed0926e4181eeb5`
- Exact structural deltas: 24,136
- Added: 8,154
- Changed: 8,593
- Removed: 7,389

Each category records its exact delta count and the SHA-256 of its sorted exact
delta identities. The compact `behavioral-oracle-delta-review.json` certificate
also pins the immutable baseline and reviewed current-corpus hashes, rationale,
and owning issue. Verification rejects unclassified paths, changed delta sets,
stale categories, duplicate categories, and corpus hash drift.

## Classification

| Count | Classification | Evidence |
| ---: | --- | --- |
| 11,382 | Draft-07 structural dialect | Effect 4 refs, definitions, optional/null unions, refinements, and composition wrappers. All 552 native public schemas (550 operations plus two context/version tools) and the 10-tool ChatGPT-visible surface compile under strict Ajv Draft-07. |
| 2,614 | Schema metadata | Authored descriptions restored by the central adapter and obsolete Effect 3 generator-default titles/descriptions removed. |
| 3,598 | Authored-constraint projection | All 550 ordered native tools remain represented; generated ref/composition paths changed. Manual cross-field constraints remain in the corpus and representative runtime/Ajv agreement passes. |
| 6,532 | Tool inventory | The HR, guarded-administration, approval, saved-document, package-viability, and split read/write proxy tools are reviewed across native/proxy discovery, CLI routing, and bundled-process fixtures. Destructive execution carries the approval ID, exact tool name, and unchanged arguments so hosts can inspect the target before confirmation. Existing native ordering is preserved and the new proxy tools are inserted before the legacy mixed executor. |
| 6 | CLI JSON parse diagnostics | Effect 4 adds deterministic line/column context; code, hint, retryability, and exit status are unchanged. |
| 4 | CLI help rendering | The Effect 4 CLI renderer intentionally uses concise help. Route inventory and ordering remain unchanged. |

The comparison deliberately retains public array order, descriptions, titles,
refs, required fields, enums, patterns, bounds, compositions, help, and error
messages. Only the pre-existing package-version normalization is applied; no
schema or constraint difference is hidden by wildcard normalization.

## Verification

```bash
mise exec node@22.22.2 -- pnpm verify:effect4-oracle:built
mise exec node@22.22.2 -- pnpm exec vitest run \
  src/domain/schemas/json-schema.test.ts \
  test/mcp/input-schema-compat.test.ts \
  test/mcp/input-schema-compat.property.test.ts \
  test/mcp/json-schema-refs.test.ts \
  test/scripts/effect4-oracle.test.ts \
  test/scripts/effect4-oracle-parity.test.ts
```

The full verifier re-renders the current bundled corpus and matches all 24,136
exact entries. Any future semantic or structural drift is unexpected; an
accepted entry that stops occurring is stale and also fails verification.
