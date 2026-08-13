# Effect 3 baseline certification

Date: 2026-08-12
Baseline commit: `ffdb965a66f635eabbba65e51f061606b13b49cb`

This document is the sanitized certification ledger for the Effect 3 behavior
that the Effect 4 migration must preserve. It contains no Huly URL, workspace,
account, token, password, request header, or response payload from local Huly.

## Deterministic behavioral oracle

The tracked `behavioral-oracle.json` is generated from freshly built artifacts by
`pnpm capture:effect4-oracle` and checked byte-for-byte by
`pnpm verify:effect4-oracle`, which rebuilds both artifacts before comparing.
Object keys are canonicalized while observable array order is retained.

| Captured surface | Baseline result |
| --- | ---: |
| Raw registered operations | 522 |
| Operation-registry entries | 522 |
| Client-exposed native tool schemas | 522 |
| CLI catalog routes | 522 |
| Registered operations without a CLI route | 0 |
| CLI routes without a registered operation | 0 |
| Built-in MCP tools | 2 |
| Proxy MCP tools | 4 |
| Resource templates | 3 |

The bundled stdio `tools/list` result is the sole complete schema oracle. For every
public tool it retains the name, description, annotations, input schema, and output
schema exactly as a client receives them. Compact internal inventories retain only
tool ordering, categories, and built-in/proxy names, avoiding a second contract
against Effect 3's private schema representation. A supplemental compact corpus
retains only the paths and values of authored raw `oneOf`, `anyOf`, `not`, and
boolean-valued JSON Schema constraints, associated with their tool names. This
catches constraints that the public compatibility projection intentionally removes
without duplicating complete private schemas. The oracle also retains resource
template discovery, representative invalid MCP requests, all CLI route metadata,
root/group/leaf help, structured-input precedence and ordering, and
human/JSON/internal CLI failures with exit statuses.

Known package-version locations in MCP response metadata and CLI help are replaced
with `<package-version>` so a release bump is not treated as behavioral drift.
Separate artifact checks assert that each freshly built bundle embeds the version
from its own package manifest.

The live CLI result is 522 routes for 522 operations with no ignored operations.
The historical 451-route/71-ignored constants remain in the oracle only as
labeled history; they are not the migration baseline.

`resources/list` is workspace-derived and can contain project identifiers, names,
and descriptions. Persisting the live response would leak local data and make the
oracle nondeterministic, so no live resource payload is checked in. The built,
no-config stdio exchange captures the stable response shape and count (`0`), while
the three deterministic resource templates and invalid-resource parsing remain
fully captured. Local integration runs exercise live discovery without retaining
their payloads.

The storage property generator was narrowed to DNS-valid, non-punycode-looking
public labels. Its former arbitrary could end a label with `-` or begin with
`xn--`; URL parsing and SSRF classification correctly treat those differently,
creating false counterexamples unrelated to storage behavior. This is a baseline
test-domain correction, not a production contract change.

## Verification matrix

Use `pass`, `fail`, or `not run` and record only sanitized observations. Commands
requiring local Huly must use the container URL rewrite documented in
`AGENTS.md`; never paste resolved configuration or response bodies here.

| Verification | Result | Sanitized evidence |
| --- | --- | --- |
| `pnpm verify:effect4-oracle` | pass | Canonical tracked bytes match a fresh capture. |
| `pnpm check-all` | pass | Complete aggregate passed after the remote stdio lifecycle merge and artifact certification: 289 files and all 4,271 tests; 99.57% statements, 99.01% branches, 99.25% functions, and 99.61% lines. |
| MCP bundle composition and embedded version | pass | The immutable Effect 3 baseline is 8,436,736 raw / 1,597,327 gzip bytes. The certified Effect 4 artifact is 8,253,902 raw / 1,561,887 gzip bytes (-2.17% / -2.22%), with executable mode `0755` and the reviewed AJV-runtime-plus-`ws` nonlocal composition. |
| CLI bundle composition, embedded version, and dependency closure | pass | Schema-decoded baseline/current byte counts and absolute/percentage deltas are generated and verified in `cli-artifact-size.json`; the decrease follows removal of the Effect 3 CLI runtime and compatibility surface. `ws` remains the exact one-member external set. |
| Packed CLI smoke behavior | pass | A freshly packed and installed CLI reported `huly v0.48.1`, exposed 54 root commands and all 522 catalog routes, and passed representative help, confirmation, structured explicit-field precedence, exact text/JSON error streams, and exit-status checks. Packed Agent Skill files were byte-identical to their generated sources. |
| Node 22/24 clean consumers | pass | Fresh pnpm and npm projects on exact Node 22.22.2 and 24.15.0 installed both tarballs, resolved their complete dependency graphs, and passed MCP discovery/call/invalid/shutdown plus CLI version/help/structured-input/error certification. |
| Built stdio discovery and protocol behavior | pass | Final 2026-07-28 discovery and legacy 2025-06-18 initialize/tools-list exchanges captured; native mode exposed 524 tools, proxy mode exposed 6 tools, and 3 resource templates were listed. The deterministic no-config resource list returned 0 resources. Missing arguments, extra arguments on a no-argument builtin, and unknown-tool responses were captured from the wire. |
| Built CLI help, input errors, and global-flag placement | pass | Root/group/leaf help and human/JSON failures were captured with exit/stdout/stderr. `--json` before and after a deep command both produced the same structured failure class and exit status. |
| HTTP discovery, authentication modes, and lifecycle | fail | Environment-config HTTP completed cleanup with 1,092 passed, 0 failed, and 30 skipped of 1,122. The request-header/token run passed hundreds of cases before transport degradation, then exited 1 after at least 35 observed no-response failures across space, association, board/view, mail, activity, workspace, attachment, test-management, process, and drive operations; cleanup completed. |
| Native/proxy tool-scope matrix | fail | The first of eight cases exposed the expected six proxy tools and resolved `auto` to `proxy`, but classified client `codex-cli` as `unknown` instead of `codex`; the script stopped before later cases. |
| Local-Huly full MCP integration | fail | Stdio completed cleanup with 1,070 passed, 5 failed, and 29 skipped of 1,104. The five no-response failures were three lead queries/creates and recruiting comment/attachment creation. |
| Local-Huly full packed-CLI integration | fail | The packed suite exited 1 with 738 labeled passes and 46 labeled failures. Two search/replace fixture failures preceded a no-response cascade beginning at calendar event creation and affecting later calendar, planner, board, drive, association, notification, and space cases. Trap cleanup completed and removed its temporary workspace. |

## Reference provenance

The lookup order and exact source commits are tracked in
`docs/mcps/effect.md`. The local reference directories are intentionally ignored;
their refs must be verified before the dependency cutover rather than inferred
from an ambiguous Effect checkout.
