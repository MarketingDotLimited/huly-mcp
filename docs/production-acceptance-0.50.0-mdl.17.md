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
5. **Isolated TSK Lifecycle (Unique Prefix: QA-1788302885-15134)**:
   - **Create**: Successfully created issue (TSK-18).
   - **Update**: Successfully updated issue description.
   - **Add Comment**: Successfully added a comment utilizing `add_comment` (Comment ID: `6a975628f40078be316be145`).
   - **Read**: Successfully read the issue via `get_issue`.
   - **Prepare Delete**: Generated approval ID (`approval_0e17daf7-714b-4544-beba-6d2fb4feefa8`) for issue deletion.
   - **Execute Delete**: Successfully deleted the issue using the approval ID.
   - **Replay Rejection**: Attempting to execute the approval ID a second time correctly rejected the operation.
   - **Get Not Found / Zero Residue**: Querying the deleted issue (`get_issue`) returned an error, verifying it was completely removed.
   - **Search Validation**: Exact prefix search for `QA-1788302885-15134` returned 0 matches, confirming zero residue.
6. **No Modifications to MDL or RAB**: All mutating actions were completely isolated to the `TSK` project workspace.
7. **Robust Validation**: Acceptance script was upgraded to accurately parse `text/event-stream` payloads directly through `jq` to reliably reject `isError=true` responses.

## Outcome
All production acceptance gates passed successfully. The `0.50.0-mdl.17` release is deployed to the production connector infrastructure.
