# Production acceptance — `0.50.0-mdl.11`

Date: 2026-09-01

Endpoint: `https://os-mcp.marketing.limited/mcp`

Source revision: `d98fb39f53dc5ead454f7db7a3cb496a24e4362a`

Tag: `v0.50.0-mdl.11`

## Result

The deployed OS MCP passed a live end-to-end acceptance cycle from Codex. The
cycle exercised discovery, downstream Huly reads, reversible writes, strict
executor isolation, inspectable destructive approval, cleanup, and replay
protection.

The test changed only one synthetic issue in the `TSK` project. The issue and
its comment were deleted during the same cycle. No `MDL` or `RAB` record was
changed.

## Runtime contract

| Check | Observed result |
| --- | --- |
| Package version | `0.50.0-mdl.11` |
| Client classification | `codex` |
| Configured mode | `auto` |
| Resolved mode | `proxy` |
| Exposed MCP actions | 10 |
| Registered Huly tools | 550 |
| Proxy candidate tools | 550 |
| Huly workspace | `marketingdotlimited` |
| Downstream Huly read | Passed |

The exposed proxy actions were:

1. `list_tool_categories`
2. `search_tools`
3. `get_tool_schema`
4. `invoke_read_tool`
5. `invoke_write_tool`
6. `invoke_tool`
7. `prepare_tool_action`
8. `execute_tool_action`

Together with `get_version` and `get_huly_context`, the live surface contained
exactly ten actions.

## Safety and validation evidence

| Test | Result |
| --- | --- |
| `invoke_read_tool` calling `create_issue` | Rejected before dispatch |
| `invoke_write_tool` calling `list_projects` | Rejected before dispatch |
| `create_issue` without `title` | Rejected by target schema |
| Unknown or unapproved destructive execution | Not used |
| Replaying a consumed approval ID | Rejected as already used |

The executor errors identified the correct alternative executor and did not
perform a mutation.

## Reversible production lifecycle

The acceptance cycle used the prefix
`MCP-QA-MDL11-20260901T081900Z` and performed these operations:

1. Created `TSK-5`.
2. Updated its title and description.
3. Added one synthetic comment.
4. Read back the issue and comment.
5. Prepared `delete_issue` for the exact arguments
   `{ "project": "TSK", "identifier": "TSK-5" }`.
6. Received an inspectable approval ID, tool name, argument object, argument
   hash, warning, and expiration.
7. Executed the approved action with the same tool name and exact arguments.
8. Confirmed `{ "identifier": "TSK-5", "deleted": true }`.
9. Confirmed replay of the approval ID was rejected.
10. Confirmed both issue-title search and workspace full-text search returned
    zero records for the synthetic prefix.

## Final production state

- Synthetic issues remaining: 0
- Synthetic comments remaining: 0
- Successful creates: 1
- Successful updates: 1
- Successful comments: 1
- Successful approved deletes: 1
- `MDL` mutations: 0
- `RAB` mutations: 0
- Cleanup residue: 0

This certifies the server-side approval contract introduced in
`0.50.0-mdl.11`. ChatGPT must refresh or recreate its app action snapshot
before testing the changed `execute_tool_action` input schema in a new
conversation.
