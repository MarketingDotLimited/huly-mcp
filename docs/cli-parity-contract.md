# CLI parity contract

The Huly CLI has full operation parity when every operation in the shared Huly operation registry has exactly one unique native CLI route. The CLI invokes that registry directly; it does not proxy through MCP. MCP protocol features such as JSON-RPC transport, `tools/list`, resources, prompts, proxy discovery tools, and multimodal content envelopes are therefore outside the operation-count boundary. The CLI must provide native equivalents where presentation differs: generated command help for discovery, JSON or human-readable terminal output for structured results, image descriptors or file output for binary results, and terminal warnings for agent-visible diagnostics.

The recorded starting point for this program is 522 shared operations, 451 CLI routes, 71 explicitly ignored operations, 68 commands directly exercised by the live CLI script, and 383 per-command integration deferrals. `pnpm report-cli-parity` reports both that immutable baseline and current mechanically derived counts.

The current certified contract is 522 shared operations, 522 unique native CLI routes, and 0 ignored operations. The 451/71 figures above are retained only as the historical migration baseline; they are not the live route inventory.

## Required behavior classes

The generic adapter must prove these behavior classes:

- ordinary scalar flags and positionals;
- unions and structured JSON values;
- explicit `null` for schema-supported clear semantics;
- text fields loaded from files;
- upload sources from server-local paths, fetched URLs, and client-provided base64;
- structured human-readable and JSON output;
- binary file output and image-safe terminal presentation;
- agent-visible warnings and typed operation errors;
- explicit confirmation for consequential operations; and
- workspace administration through the workspace client.

Shared domain behavior remains owned and tested by the operation registry. A CLI command needs a dedicated live case only when it introduces unique transport, safety, privacy, workspace-client, or lifecycle risk. Otherwise a representative live case for its adapter behavior class is sufficient. The coverage manifest introduced by the parity program must record every behavior class and every uniquely risky operation; adding an unclassified behavior or risk must fail verification.

## Input precedence

Inputs are merged in this order, from lowest to highest precedence: JSON sources (`--input-json` and `--input-file`) in command-line order, positionals, then explicit field flags and file-backed field flags. The operation's Effect Schema remains the boundary parser. JSON is the native escape hatch for nested objects, arrays, and unions.

## Generated reference

The runtime command tree, root help, parity report, and published command reference all derive from `cliCommandCatalog` plus the shared operation schemas. Hand-maintained command inventories are not authoritative. `pnpm update-cli-readme` regenerates the reference and `pnpm verify-cli-readme` rejects drift.
