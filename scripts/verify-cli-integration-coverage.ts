import { readFileSync } from "node:fs"

import { cliCommandCatalog } from "../packages/huly-cli/src/catalog.js"
import { CLI_LIVE_COVERAGE_CASES } from "../packages/huly-cli/src/live-coverage.js"
import { CLI_BEHAVIOR_CLASSES, CLI_DEDICATED_LIVE_RISK_CLASSES } from "../packages/huly-cli/src/parity-contract.js"

const integrationScriptPath = "scripts/integration_test_cli.sh"
const coveredToolPattern = /(?:cover_cli_json|capture_cli_json|cover_cli_failure) "([a-z0-9_]+)"/g
const coveredCasePattern = /cli_live_case "([a-z0-9-]+)"/g

const coveredToolFromMatch = (match: RegExpExecArray): string => {
  const toolName = match[1]
  if (toolName === undefined) {
    throw new Error("Internal error: covered tool regex matched without a tool name.")
  }
  return toolName
}

const uniqueSorted = (values: Iterable<string>): ReadonlyArray<string> => [...new Set(values)].sort()

const catalogTools = Object.keys(cliCommandCatalog).sort()
const catalogToolSet = new Set(catalogTools)
const integrationScript = readFileSync(integrationScriptPath, "utf8")
const coveredTools = uniqueSorted(Array.from(integrationScript.matchAll(coveredToolPattern), coveredToolFromMatch))
const coveredToolSet = new Set(coveredTools)
const coveredCases = uniqueSorted(Array.from(integrationScript.matchAll(coveredCasePattern), coveredToolFromMatch))
const manifestCaseIds = uniqueSorted(CLI_LIVE_COVERAGE_CASES.map((coverageCase) => coverageCase.id))
const manifestTools = uniqueSorted(CLI_LIVE_COVERAGE_CASES.flatMap((coverageCase) => coverageCase.tools))
const coveredBehaviors = new Set(CLI_LIVE_COVERAGE_CASES.flatMap((coverageCase) => coverageCase.behaviors))
const coveredRisks = new Set(CLI_LIVE_COVERAGE_CASES.flatMap((coverageCase) => coverageCase.risks))

const staleCoveredTools = coveredTools.filter((tool) => !catalogToolSet.has(tool))
const staleManifestTools = manifestTools.filter((tool) => !catalogToolSet.has(tool))
const unexecutedManifestTools = manifestTools.filter((tool) => !coveredToolSet.has(tool))
const unrecordedCases = coveredCases.filter((caseId) => !manifestCaseIds.includes(caseId))
const unexecutedCases = manifestCaseIds.filter((caseId) => !coveredCases.includes(caseId))
const uncoveredBehaviors = CLI_BEHAVIOR_CLASSES.filter((behavior) => !coveredBehaviors.has(behavior))
const uncoveredRisks = CLI_DEDICATED_LIVE_RISK_CLASSES.filter((risk) => !coveredRisks.has(risk))

const errors = [
  staleCoveredTools.length === 0 ? undefined : `Covered tools not in CLI catalog: ${staleCoveredTools.join(", ")}`,
  staleManifestTools.length === 0 ? undefined : `Manifest tools not in CLI catalog: ${staleManifestTools.join(", ")}`,
  unexecutedManifestTools.length === 0
    ? undefined
    : `Manifest tools not invoked by the live script: ${unexecutedManifestTools.join(", ")}`,
  unrecordedCases.length === 0 ? undefined : `Live cases missing from the manifest: ${unrecordedCases.join(", ")}`,
  unexecutedCases.length === 0
    ? undefined
    : `Manifest cases missing from the live script: ${unexecutedCases.join(", ")}`,
  uncoveredBehaviors.length === 0 ? undefined : `CLI behaviors without live proof: ${uncoveredBehaviors.join(", ")}`,
  uncoveredRisks.length === 0 ? undefined : `CLI risks without live proof: ${uncoveredRisks.join(", ")}`
].filter((message) => message !== undefined)

if (errors.length > 0) {
  console.error("CLI integration coverage is out of sync.")
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exitCode = 1
} else {
  console.log(
    `CLI live coverage is in sync: ${coveredCases.length} behavior/risk cases, ${coveredTools.length} directly exercised commands, ${catalogTools.length} catalog routes, zero deferrals.`
  )
}
