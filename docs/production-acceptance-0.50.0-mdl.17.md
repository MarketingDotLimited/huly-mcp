# Production Acceptance: 0.50.0-mdl.17

## Environment Overview
- Target: `/opt/os-mcp` Local Docker Compose mimicking production target
- Version: `0.50.0-mdl.17`
  - *(Note: `0.50.0-mdl.16` was a failed candidate in Package Smoke (stale artifact certs) and was superseded by `0.50.0-mdl.17`)*
- Deployment Image: `ghcr.io/marketingdotlimited/huly-mcp:0.50.0-mdl.17` locally built.
  - Image ID: `sha256:811b7a43b5a7df848bb3e28fba668ff3aead332c66728a209328b33240e297e4`
  - OCI Labels:
    - `org.opencontainers.image.version`: `0.50.0-mdl.17`
    - `org.opencontainers.image.revision`: `01d2dd3c4509c861bf516dfc1b87cb2ea1078026`
    - `org.opencontainers.image.source`: `https://github.com/MarketingDotLimited/huly-mcp`
- CI Status: All CI pipelines (`CI`, `Package Smoke`, `Publish container`) for `mdl.17` were completely green.

## Verified Criteria
1. **Version Verification**: Active version is `0.50.0-mdl.17`.
2. **Raw `tools/list` Verification**: Exactly 10 tools returned, including `execute_approved_tool_action`.
3. **Timestamped Nonexistent Search**: Querying `MCP_QA_NONEXISTENT_TARGET_20260901T214501Z` returned exactly 0 results via strict JSON-RPC payload parsing.
4. **Safe `list_projects`**: Read access verified.
5. **Isolated TSK Lifecycle (Unique Prefix: MCP-QA-20260901T225038Z)**:
   - **Create**: Successfully created issue (TSK-19).
   - **Update**: Successfully updated issue description.
   - **Add Comment**: Successfully added a comment utilizing `add_comment` (Comment ID: `6a9756c0f40078be316be14b`).
   - **Verify Comment**: Successfully matched the exact comment ID and body using `list_comments`.
   - **Prepare Delete**: Generated approval ID (`approval_c3a55501-b5e0-488b-925e-552d13111f9f`) for issue deletion.
   - **Execute Delete**: Successfully deleted the issue using the approval ID.
   - **Replay Rejection**: Attempting to execute the approval ID a second time correctly rejected the operation.
   - **Zero Residue**: 
     - **list_issues**: `titleSearch` for the unique prefix returned exactly 0 matches.
     - **fulltext_search**: `invoke_read_tool` (toolName: `fulltext_search`) for the unique prefix returned exactly 0 matches.
6. **No Modifications to MDL or RAB**: All mutating actions were completely isolated to the `TSK` project workspace.
7. **Robust Validation**: Acceptance script was upgraded to accurately parse `text/event-stream` payloads directly through `jq` to reliably reject `isError=true` responses, and a safety `trap` was enforced to guarantee cleanup if an intermediate step failed.

## Outcome
All production acceptance gates passed successfully. The `0.50.0-mdl.17` release is verified and deployed to the production connector infrastructure.
