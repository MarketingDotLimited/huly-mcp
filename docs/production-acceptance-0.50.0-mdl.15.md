# Production acceptance — `0.50.0-mdl.15`

Date: 2026-09-01

Endpoint: `https://os-mcp.marketing.limited/mcp`

Release source revision: `40e58aa447928c40f7c78568817d912e958be093`

Tag: `v0.50.0-mdl.15`

Connector deployment revision: `2c8b63089fd4b1db7b38de9f673212919dd11b88`

Oracle evidence revision: `199ce99`

## Result

The deployed OS MCP passed live production acceptance for deterministic catalog
enumeration, deletion-target preflight, strict proxy routing, inspectable
approval execution, replay protection, and zero-residue cleanup.

`list_tool_categories` now returns the complete exact 550-tool catalog grouped
under all 48 categories. Every catalog row includes the target name,
description, resolved annotations, and whether two-step approval is required.
This removes the former need to reconstruct the catalog through fuzzy,
non-paginated `search_tools` calls.

Before issuing a destructive approval for a supported deletion target,
`prepare_tool_action` now runs the existing read-only `preview_deletion`
operation. A deletion request for an issue that had already been independently
confirmed absent was rejected before approval creation. A real isolated TSK
issue produced preflight evidence, was deleted through the approved executor,
and left no residue.

## Release evidence

| Check | Result |
| --- | --- |
| Full local quality gate | Passed |
| Test suite | 296 files and 4,371 tests passed |
| Statement coverage | 99.57% |
| Branch coverage | 99.00% |
| Function coverage | 99.21% |
| Line coverage | 99.62% |
| Effect diagnostics | 0 errors and 0 warnings |
| Behavioral oracle | 24,150 exact reviewed deltas verified |
| Connector tests | 14 passed |
| Connector CI | [Passed](https://github.com/MarketingDotLimited/huly-mcp-chatgpt-connector/actions/runs/33558264010) |
| Oracle evidence CI | [Passed on Node 22 and Node 24](https://github.com/MarketingDotLimited/huly-mcp/actions/runs/33560131713) |
| Package Smoke workflow | [Passed on Node 22 and Node 24](https://github.com/MarketingDotLimited/huly-mcp/actions/runs/33560131718) |
| Published container workflow | [Passed](https://github.com/MarketingDotLimited/huly-mcp/actions/runs/33558240099) |

The production service is pinned to `0.50.0-mdl.15`. The running image is
`sha256:227f806ab26798c99972be2769bf3c2a29b353f9050b8f85005bee1fc0ba799d`
and carries the release source revision and version in its OCI labels.

## Runtime contract

The gateway startup probe returned:

```text
Verified native MCP tool contract (10 tools)
```

The deployed `tools/list` response contained exactly:

```text
get_version
get_huly_context
list_tool_categories
search_tools
get_tool_schema
invoke_read_tool
invoke_write_tool
invoke_tool
prepare_tool_action
execute_approved_tool_action
```

| Check | Observed result |
| --- | --- |
| Package version | `0.50.0-mdl.15` |
| Exposed MCP actions | 10 |
| Proxy actions | 8 |
| Huly target tools | 550 |
| Tool categories | 48 |
| Catalog rows | 550 |
| Unique catalog names | 550 |
| Approval executor required fields | `approvalId`, `toolName`, `arguments` |

## Deletion-target preflight

The release acceptance run first confirmed that `TSK-999999999` did not exist,
then called `prepare_tool_action` for `delete_issue` with that identifier. The
server rejected the request before creating an approval.

For an existing synthetic issue, preparation returned live preflight evidence
identifying the entity as an issue and reporting its dependent-object counts.
The approval remained bound to the exact target tool and unchanged arguments.

Preflight currently covers:

- `delete_issue`
- `delete_project`
- `delete_component`
- `delete_milestone`

The operation fails closed if the registered read-only preview capability is
not available.

## Approval lifecycle and cleanup

The final release run created one isolated issue in TSK:

```text
TSK-14 — isolated MCP-QA-MDL15 acceptance issue
```

The server then:

1. Updated the synthetic issue.
2. Added one synthetic comment.
3. Read the issue back through `invoke_read_tool`.
4. Rejected direct destructive execution through `invoke_write_tool`.
5. Prepared `delete_issue` and returned live preflight evidence.
6. Executed `execute_approved_tool_action` using the returned `approvalId`,
   exact `toolName`, and unchanged `arguments`.
7. Rejected replay of the consumed approval.
8. Returned no matching issue for the exact run prefix.
9. Returned no matching issue or full-text result for the global
   `MCP-QA-MDL15` prefix.

Final state:

- Synthetic issues created in the final run: 1
- Synthetic issues deleted in the final run: 1
- Synthetic comments deleted with their issue: 1
- Approval replay rejected: yes
- TSK issue residue: 0
- Active TSK issues matching the broader `MCP-QA` prefix: 0
- Global full-text residue: 0
- `MDL` mutations: 0
- `RAB` mutations: 0
- Unexpected production mutations: 0

## ChatGPT refresh requirement

The live contract intentionally exposes `execute_approved_tool_action` with
`approvalId`, `toolName`, and `arguments`. The obsolete action named
`execute_tool_action` with an opaque `approvalToken` is not part of this release.

A ChatGPT app page that still shows the obsolete name or schema is using stale
action metadata even if its visible action count is ten. Refresh or rescan the
app, confirm the exact action names and schema above, publish the refreshed
metadata when required, and start a new conversation before rerunning the
ChatGPT-hosted acceptance test.
