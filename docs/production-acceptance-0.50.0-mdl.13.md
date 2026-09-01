# Production acceptance — `0.50.0-mdl.13`

Date: 2026-09-01

Endpoint: `https://os-mcp.marketing.limited/mcp`

Source revision: `70a80ae2bc9860b70354931154c699385552864f`

Tag: `v0.50.0-mdl.13`

Connector deployment revision: `d5cae6a0d2aea6ab5e656a43d4d3a5bfe48fc317`

## Result

The deployed OS MCP passed live production acceptance for the ChatGPT action
schema-cache defect. The obsolete top-level `execute_tool_action` action was
replaced with `execute_approved_tool_action`, while the complete ChatGPT
surface remains exactly ten actions.

The new executor exposes the inspectable required inputs `approvalId`,
`toolName`, and `arguments`. The connector startup probe validated the complete
name, annotation, and schema contract before serving traffic.

One isolated `TSK` record was created and deleted to verify the full lifecycle.
The consumed approval was rejected on replay, and a project-title search
confirmed zero residue. No `MDL` or `RAB` record was changed.

## Release evidence

| Check | Result |
| --- | --- |
| Local quality gate | 296 files and 4,362 tests passed |
| Statement coverage | 99.57% |
| Branch coverage | 99.00% |
| GitHub CI, Node 22 | Passed |
| GitHub CI, Node 24 | Passed |
| Packed MCP, Node 22 and 24 | Passed |
| Packed CLI, Node 22 and 24 | Passed |
| Docker image smoke | Passed |
| Published container workflow | Passed |
| Connector tests | 14 passed |

The production image is pinned to `0.50.0-mdl.13` and carries source revision
`70a80ae2bc9860b70354931154c699385552864f` in its OCI labels.

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
| Package version | `0.50.0-mdl.13` |
| Configured mode | `auto` |
| Resolved mode | `proxy` |
| Exposed MCP actions | 10 |
| Registered Huly tools | 550 |
| Proxy candidate tools | 550 |
| Approval executor required fields | `approvalId`, `toolName`, `arguments` |
| OAuth authorization-server metadata | HTTP 200 |
| Unauthenticated `/mcp` | HTTP 401 |

## Approval lifecycle

The acceptance run created:

```text
TSK-8 — MCP-QA-MDL13-... approval executor acceptance
```

The server then:

1. Read the issue back and verified that its title began with the unique QA
   prefix.
2. Prepared `delete_issue` with exact arguments
   `{ "project": "TSK", "identifier": "TSK-8" }`.
3. Returned the inspectable approval ID, tool name, and unchanged arguments.
4. Executed `execute_approved_tool_action` successfully.
5. Rejected a replay of the consumed approval as invalid or already used.
6. Returned no matching TSK issue for the unique QA prefix.

Final state:

- Synthetic issues created: 1
- Synthetic issues deleted: 1
- Approval replay rejected: yes
- Synthetic issues remaining: 0
- `MDL` mutations: 0
- `RAB` mutations: 0
- Cleanup residue: 0

## ChatGPT refresh requirement

The action rename deliberately changes the host-visible identity so a refresh
cannot silently retain the obsolete schema under the old action name. After
refreshing or rescanning the app, ChatGPT must show
`execute_approved_tool_action` and must not show `execute_tool_action`.

The new action's required input fields must be exactly the inspectable
`approvalId`, `toolName`, and `arguments` contract. A connection that still
shows `execute_tool_action` with only `approvalToken` is using the superseded
snapshot and must not be used for destructive acceptance testing.
