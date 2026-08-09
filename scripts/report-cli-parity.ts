import { readFileSync } from "node:fs"

import { cliCommandCatalog, ignoredMcpTools } from "../packages/huly-cli/src/catalog.js"
import { CLI_PARITY_BASELINE, CLI_PARITY_TARGET } from "../packages/huly-cli/src/parity-contract.js"
import { allTools } from "../src/mcp/tools/index.js"

const integrationScriptPath = "scripts/integration_test_cli.sh"
const deferredToolsPath = "scripts/cli-integration-deferred-tools.txt"
const coveredToolPattern = /(?:cover_cli_json|capture_cli_json) "([a-z0-9_]+)"/g
const JSON_INDENT_SPACES = 2

const nonCommentLines = (path: string): ReadonlyArray<string> =>
  readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))

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
    deferredLiveCases: nonCommentLines(deferredToolsPath).length
  },
  target: CLI_PARITY_TARGET
}

console.log(JSON.stringify(report, null, JSON_INDENT_SPACES))
