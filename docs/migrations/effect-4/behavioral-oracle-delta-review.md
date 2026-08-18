# Effect AI MCP behavioral-oracle review

The direct Effect AI migration replaces the previous MCP SDK wire fixture. The
tracked `behavioral-oracle.json` is now the sanitized current certificate: it
captures real built stdio exchanges and stateful HTTP exchanges using MCP
`2025-06-18`, including initialize/initialized lifecycle, tool/resource
responses, protocol errors, and native/proxy surfaces.

## Reviewed corpus identity

- Current corpus SHA-256:
  `48da0bfa5019c7421e1b8bc11038d6280bcc9fcc11818eaa3383703af4e51047`
- Exact deltas against the reviewed current corpus: 0

This recapture also certifies that protocol input is admitted only after the
complete native/proxy tool registry and resource templates are registered; the
earlier partial-startup snapshot is intentionally superseded.

The compact JSON review certificate intentionally has no legacy SDK delta
categories. The previous 2026 discovery/stateless fixtures were removed as
obsolete rather than accepted as compatibility behavior. Future changes must
capture a fresh built corpus and classify any resulting deltas before release.

## Verification

```bash
mise exec node@22.22.2 -- pnpm verify:effect4-oracle:built
mise exec node@22.22.2 -- pnpm exec vitest run \
  test/scripts/effect4-oracle.test.ts \
  test/scripts/effect4-oracle-parity.test.ts
```

The verifier compares canonical bytes, checks the review certificate, and
rejects drift in the built stdio/HTTP response corpus or registry inventory.
