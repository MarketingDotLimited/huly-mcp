# Production acceptance — `0.50.0-mdl.14`

Date: 2026-09-01

Endpoint: `https://os-mcp.marketing.limited/mcp`

Release source revision: `c8b48d86913e5aadcf79449036c8ace01a3dd4e3`

Tag: `v0.50.0-mdl.14`

Connector deployment revision: `d0818a2c821a4700a5ca265de9c34347aa3ca3bf`

## Result

The deployed OS MCP passed live production acceptance for strict input
validation and the inspectable destructive approval lifecycle.

The server now rejects undeclared properties consistently across registered
native tools, `invoke_read_tool`, `invoke_write_tool`, the legacy
`invoke_tool`, proxy metadata actions, and `prepare_tool_action`. Rejection
happens before target dispatch, mutation, approval creation, or argument
hashing.

The earlier synthetic `TSK-9` issue and its attached comment were deleted
through the current `execute_approved_tool_action` contract before the release
test. The release test then created and deleted one isolated `TSK-10` issue.
Both consumed approvals were rejected on replay. Final project searches found
zero QA residue in `TSK`, `MDL`, and `RAB`.

## Release evidence

| Check | Result |
| --- | --- |
| Focused strict-input tests | 115 passed |
| Full local quality gate | 296 files and 4,365 tests passed |
| Statement coverage | 99.57% |
| Branch coverage | 99.00% |
| Effect diagnostics | 0 errors and 0 warnings |
| Connector tests | 14 passed |
| Connector CI | Passed |
| Published container workflow | Passed |

The production image is pinned to `0.50.0-mdl.14` and carries source revision
`c8b48d86913e5aadcf79449036c8ace01a3dd4e3` in its OCI labels.

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
| Package version | `0.50.0-mdl.14` |
| Exposed MCP actions | 10 |
| Registered Huly tools | 550 |
| Approval executor required fields | `approvalId`, `toolName`, `arguments` |
| OAuth authorization-server metadata | HTTP 200 |
| Unauthenticated `/mcp` | HTTP 401 |

## Strict-input acceptance

The live release test injected an undeclared `unexpected` field into each of
these paths:

1. `search_tools`
2. `invoke_read_tool` targeting `get_issue`
3. `invoke_write_tool` targeting `create_issue`
4. `invoke_tool` targeting `get_issue`
5. `prepare_tool_action` targeting `delete_issue`

All five calls failed with an excess-property validation error. The invalid
`create_issue` call created no issue, and the invalid approval preparation
created no executable approval.

## Approval lifecycle and cleanup

The release acceptance run created:

```text
TSK-10 — MCP-QA-MDL14-20260901T191700Z strict approval lifecycle
```

The server then:

1. Read the issue back and verified its unique QA title prefix.
2. Prepared `delete_issue` with exact arguments
   `{ "project": "TSK", "identifier": "TSK-10" }`.
3. Executed `execute_approved_tool_action` with the returned inspectable
   `approvalId`, `toolName`, and unchanged `arguments`.
4. Rejected replay of the consumed approval.
5. Returned no matching issue for the release prefix.
6. Returned no matching issue for the earlier `TSK-9` prefix.
7. Returned no matching issue in `MDL` or `RAB`.

Final state:

- Earlier `TSK-9` residue deleted: yes
- Synthetic release issues created: 1
- Synthetic release issues deleted: 1
- Approval replay rejected: yes
- Synthetic issues remaining: 0
- `MDL` mutations: 0
- `RAB` mutations: 0
- Cleanup residue: 0

## ChatGPT refresh requirement

The action count alone cannot prove that a ChatGPT connection has current
schemas. A connection that exposes ten actions but still shows
`execute_tool_action` with only `approvalToken` is stale because the live
server exposes `execute_approved_tool_action` with `approvalId`, `toolName`,
and `arguments`.

Refresh or rescan the app and start a new conversation. The refreshed action
list must include `execute_approved_tool_action` and must not include the
obsolete `execute_tool_action` action.
