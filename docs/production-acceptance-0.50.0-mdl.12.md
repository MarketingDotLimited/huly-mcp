# Production acceptance — `0.50.0-mdl.12`

Date: 2026-09-01

Endpoint: `https://os-mcp.marketing.limited/mcp`

Source revision: `cfd5912ae1f1db06d19405b6f410d0115ba519b6`

Tag: `v0.50.0-mdl.12`

Connector deployment revision: `7800378`

## Result

The deployed OS MCP passed focused live production acceptance for the two
server defects reported by ChatGPT:

1. Read-only Workspace and Security tools no longer require destructive
   two-step approval.
2. `prepare_tool_action` validates the target tool's input schema before it
   creates an approval.

The existing synthetic QA residue `TSK-6` was deleted through the repaired
inspectable approval lifecycle. The consumed approval was rejected on replay,
and both project and global searches confirmed zero residue. No `MDL` or `RAB`
record was changed.

## Release evidence

| Check | Result |
| --- | --- |
| Local quality gate | 296 files and 4,362 tests passed |
| Branch coverage | 99.00% |
| GitHub CI, Node 22 | Passed |
| GitHub CI, Node 24 | Passed |
| Packed MCP, Node 22 and 24 | Passed |
| Packed CLI, Node 22 and 24 | Passed |
| Docker image smoke | Passed |
| Published container workflow | Passed |

The production image is pinned to `0.50.0-mdl.12` and carries source revision
`cfd5912ae1f1db06d19405b6f410d0115ba519b6` in its OCI labels.

## Runtime contract

| Check | Observed result |
| --- | --- |
| Package version | `0.50.0-mdl.12` |
| Client classification | `codex` |
| Configured mode | `auto` |
| Resolved mode | `proxy` |
| Exposed MCP actions | 10 |
| Registered Huly tools | 550 |
| Proxy candidate tools | 550 |
| Huly workspace | `marketingdotlimited` |
| OAuth authorization-server metadata | HTTP 200 |
| OAuth protected-resource metadata | HTTP 200 |
| Unauthenticated `/mcp` | HTTP 401 |

## Read-only classification verification

Each previously misclassified tool was invoked successfully through
`invoke_read_tool`:

- `get_workspace_info`
- `list_workspace_members`
- `list_workspaces`
- `get_user_profile`
- `get_class_collaborator_metadata`

All five retained `readOnlyHint: true` and no longer entered the destructive
approval path.

## Approval validation verification

Preparing `delete_issue` with `{ "project": "TSK" }` failed before approval:

```text
Invalid parameters for delete_issue: identifier: is missing
```

Preparing `create_huly_enum` with `{}` also failed before approval:

```text
Invalid parameters for create_huly_enum: name: is missing
```

Neither invalid request returned an approval ID or performed a mutation.

## Cleanup lifecycle

The existing issue was verified before deletion:

```text
TSK-6 — MCP-QA-20260901T083854Z CLEANUP-BLOCKED
```

The server then:

1. Prepared `delete_issue` with exact arguments
   `{ "project": "TSK", "identifier": "TSK-6" }`.
2. Returned an inspectable `approvalId`, tool name, arguments, argument hash,
   warning, and expiration.
3. Executed the same tool name and exact arguments successfully.
4. Returned `{ "identifier": "TSK-6", "deleted": true }`.
5. Rejected replay with `Approval token is invalid or already used.`
6. Returned no matching TSK issue and zero global full-text results for the QA
   prefix.

Final state:

- Synthetic issues remaining: 0
- Synthetic comments remaining: 0
- `MDL` mutations: 0
- `RAB` mutations: 0
- Cleanup residue: 0

## ChatGPT app snapshot note

The live server and connector repository expose the inspectable
`execute_tool_action` contract with `approvalId`, `toolName`, and `arguments`.
A ChatGPT app snapshot that still exposes only `approvalToken` is schema-stale
even when it lists all ten action names. That connection must be refreshed or
rescanned and tested in a new conversation; matching action counts alone do
not prove matching schemas.
