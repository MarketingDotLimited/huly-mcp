import { readFileSync } from "node:fs"

import { cliCommandCatalog } from "../packages/huly-cli/src/catalog.js"
import {
  cliIntegrationCoverageDecision,
  CLI_COVERAGE_REVIEWED_REGISTRY_OPERATIONS,
  CLI_LIVE_COVERAGE_CASES,
  CLI_REVIEWED_COVERAGE_CATEGORIES
} from "../packages/huly-cli/src/live-coverage.js"
import { CLI_BEHAVIOR_CLASSES, CLI_DEDICATED_LIVE_RISK_CLASSES } from "../packages/huly-cli/src/parity-contract.js"
import { allTools } from "../src/mcp/tools/index.js"

const integrationScriptPath = "scripts/integration_test_cli.sh"
const coveredToolPattern =
  /(?:cover_cli_json|capture_cli_json|cover_cli_failure|cover_cli_confirmed_failure) "([a-z0-9_]+)"/g
const coveredCasePattern = /cli_live_case_begin "([a-z0-9-]+)"([\s\S]*?)cli_live_case_end "\1"/g

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
const caseExecutions = Array.from(integrationScript.matchAll(coveredCasePattern), (match) => ({
  id: coveredToolFromMatch(match),
  tools: uniqueSorted(Array.from((match[2] ?? "").matchAll(coveredToolPattern), coveredToolFromMatch))
}))
const coveredCases = uniqueSorted(caseExecutions.map((execution) => execution.id))
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
const caseToolMismatches = CLI_LIVE_COVERAGE_CASES.flatMap((coverageCase) => {
  const execution = caseExecutions.find((candidate) => candidate.id === coverageCase.id)
  if (execution === undefined) return []
  const expected = uniqueSorted(coverageCase.tools)
  return expected.length === execution.tools.length && expected.every((tool, index) => tool === execution.tools[index])
    ? []
    : [`${coverageCase.id}: expected ${expected.join(", ")}; executed ${execution.tools.join(", ")}`]
})
const coverageDecisions = allTools.map((tool) =>
  cliIntegrationCoverageDecision(tool.name, tool.category, cliCommandCatalog[tool.name])
)
const representativeRoutes = coverageDecisions.filter((decision) => decision.type === "representative").length
const classifiedRisks = new Set(coverageDecisions.flatMap((decision) => decision.risks))
const unclassifiedRegistryRisks = CLI_DEDICATED_LIVE_RISK_CLASSES.filter((risk) => !classifiedRisks.has(risk))
const registryCategories = uniqueSorted(allTools.map((tool) => tool.category))
const unreviewedCategories = registryCategories.filter(
  (category) => !CLI_REVIEWED_COVERAGE_CATEGORIES.includes(category)
)

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
  uncoveredRisks.length === 0 ? undefined : `CLI risks without live proof: ${uncoveredRisks.join(", ")}`,
  caseToolMismatches.length === 0
    ? undefined
    : `Live case tool membership differs from the manifest: ${caseToolMismatches.join("; ")}`,
  coverageDecisions.length === catalogTools.length ? undefined : "Not every CLI route has a coverage decision.",
  allTools.length === CLI_COVERAGE_REVIEWED_REGISTRY_OPERATIONS
    ? undefined
    : `Registry changed from reviewed revision ${String(CLI_COVERAGE_REVIEWED_REGISTRY_OPERATIONS)} to ${String(allTools.length)}; review every new operation's behavior and risk classification.`,
  unreviewedCategories.length === 0
    ? undefined
    : `CLI coverage risk classification is missing categories: ${unreviewedCategories.join(", ")}`,
  unclassifiedRegistryRisks.length === 0
    ? undefined
    : `No registry operations are classified for CLI risks: ${unclassifiedRegistryRisks.join(", ")}`
].filter((message) => message !== undefined)

if (errors.length > 0) {
  console.error("CLI integration coverage is out of sync.")
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exitCode = 1
} else {
  console.log(
    `CLI live coverage is in sync: ${coveredCases.length} behavior/risk cases, ${coveredTools.length} directly exercised commands, ${representativeRoutes} routes covered by shared operations plus adapter-class cases, ${catalogTools.length} catalog routes, zero deferrals.`
  )
}
