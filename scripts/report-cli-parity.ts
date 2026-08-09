import { readFileSync } from "node:fs"

import { cliCommandCatalog, ignoredMcpTools } from "../packages/huly-cli/src/catalog.js"
import { CLI_PARITY_BASELINE, CLI_PARITY_TARGET } from "../packages/huly-cli/src/parity-contract.js"
import { allTools } from "../src/mcp/tools/index.js"

const integrationScriptPath = "scripts/integration_test_cli.sh"
const coveredToolPattern = /(?:cover_cli_json|capture_cli_json|cover_cli_failure) "([a-z0-9_]+)"/g
const JSON_INDENT_SPACES = 2

const coveredTools = new Set(
  Array.from(readFileSync(integrationScriptPath, "utf8").matchAll(coveredToolPattern), (match) => match[1]).filter(
    (name) => name !== undefined
  )
)

const report = {
  baseline: CLI_PARITY_BASELINE,
  current: {
    registryOperations: allTools.length,
    cliRoutes: Object.keys(cliCommandCatalog).length,
    ignoredOperations: ignoredMcpTools.length,
    directLiveCases: coveredTools.size,
    deferredLiveCases: 0
  },
  target: CLI_PARITY_TARGET
}

console.log(JSON.stringify(report, null, JSON_INDENT_SPACES))
