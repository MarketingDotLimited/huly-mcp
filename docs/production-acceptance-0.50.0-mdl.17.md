# Production Acceptance: 0.50.0-mdl.17

## Environment Overview
- Target: `/opt/os-mcp` Local Docker Compose matching `ghcr.io/marketingdotlimited/huly-mcp:0.50.0-mdl.17`
- Version: `0.50.0-mdl.17`
- Deployment Image: `ghcr.io/marketingdotlimited/huly-mcp:0.50.0-mdl.17` locally built.
  - Image ID: `sha256:811b7a43b5a7df848bb3e28fba668ff3aead332c66728a209328b33240e297e4`
  - OCI Labels:
    - `org.opencontainers.image.version`: `0.50.0-mdl.17`
    - `org.opencontainers.image.revision`: `01d2dd3c4509c861bf516dfc1b87cb2ea1078026`
    - `org.opencontainers.image.source`: `https://github.com/MarketingDotLimited/huly-mcp`

## Verified Criteria
1. **Version Verification**: Active version is `0.50.0-mdl.17`.
2. **Raw `tools/list` Verification**: Exactly 10 tools returned, including `execute_approved_tool_action`.
3. **Timestamped Nonexistent Search**: Querying `MCP_QA_NONEXISTENT_TARGET_20260901T214501Z` returned exactly 0 results.
4. **Safe `list_projects`**: Read access verified.
5. **Isolated TSK Lifecycle**:
   - Create: Successfully created issue (TSK-15).
   - Update: Successfully updated issue description.
   - Comment: Successfully added a comment.
   - Prepare Delete: Generated approval ID for issue deletion.
   - Execute: Successfully deleted the issue using the approval ID.
   - Replay Rejection: Attempting to use the approval ID a second time correctly rejected the operation.
   - Get Not Found / Zero Residue: Querying the deleted issue returned an error verifying it was completely removed.
6. **No Modifications to MDL or RAB**: All mutating actions were completely isolated to the `TSK` project workspace.

## Outcome
All production acceptance gates passed successfully. The `0.50.0-mdl.17` release is deployed to the production connector infrastructure.
