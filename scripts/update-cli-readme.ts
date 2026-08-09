import { readFileSync, writeFileSync } from "node:fs"

import { cliCommandCatalog, isCliToolName } from "../packages/huly-cli/src/catalog.js"
import type { CliCommandSpec } from "../packages/huly-cli/src/catalog-types.js"
import { operationRegistry } from "../src/mcp/tools/index.js"
import { collectFieldSpecs } from "../packages/huly-cli/src/schema-fields.js"
import { explicitCliConfirmationMessage } from "../packages/huly-cli/src/safety-policies.js"

const readmePath = "packages/huly-cli/README.md"
const startMarker = "<!-- CLI_COMMAND_REFERENCE_START -->"
const endMarker = "<!-- CLI_COMMAND_REFERENCE_END -->"
const checkOnly = process.argv.includes("--check")
const NOT_FOUND = -1

const optionName = (fieldName: string): string =>
  fieldName
    .replaceAll("_", "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()

const commandRows = (): string =>
  Object.entries(cliCommandCatalog)
    .toSorted(([, left], [, right]) => left.path.join(" ").localeCompare(right.path.join(" ")))
    .map(([toolName, spec]) => {
      if (!isCliToolName(toolName)) throw new Error(`Unknown CLI catalog tool ${toolName}.`)
      const commandSpec: CliCommandSpec = spec
      const operation = operationRegistry.getOperation(toolName)
      const positional = new Set(commandSpec.positional)
      const flags = [...collectFieldSpecs(operation.inputSchema).values()]
        .filter((field) => !positional.has(field.fieldName))
        .map((field) => `\`--${optionName(field.fieldName)}\``)
      const fileFlags = (commandSpec.behavior?.fileInput?.fields ?? []).map(
        (field) => `\`--${optionName(field)}-file\``
      )
      const base64FileFlags = (commandSpec.behavior?.base64FileInput?.fields ?? []).map(
        (field) => `\`--${optionName(field)}-base64-file\``
      )
      const confirmation =
        explicitCliConfirmationMessage(toolName, commandSpec) === undefined ? "" : " Requires `--yes`."
      const output = commandSpec.behavior?.fileOutput === undefined ? "" : " Supports `--output <path>`."
      const inputs = [...flags, ...fileFlags, ...base64FileFlags]
      return `| \`huly ${commandSpec.path.join(" ")}\` | ${commandSpec.description}${confirmation}${output} | ${inputs.length === 0 ? "—" : inputs.join(", ")} |`
    })
    .join("\n")

const generated = [
  startMarker,
  "<!-- Generated from cliCommandCatalog and shared operation schemas. Run `pnpm update-cli-readme`. -->",
  "## Complete command reference",
  "",
  "All commands also accept `--json`, `--input-json <object>`, and `--input-file <path>`. Explicit flags override JSON sources. Structured fields accept JSON. A field shown as a positional may also be supplied by its generated flag.",
  "",
  "| Command | Purpose and behavior | Field flags |",
  "| --- | --- | --- |",
  commandRows(),
  endMarker
].join("\n")

const source = readFileSync(readmePath, "utf8")
const start = source.indexOf(startMarker)
const end = source.indexOf(endMarker)
const next =
  start === NOT_FOUND || end === NOT_FOUND
    ? `${source.trimEnd()}\n\n${generated}\n`
    : `${source.slice(0, start)}${generated}${source.slice(end + endMarker.length)}`

if (checkOnly) {
  if (next !== source) {
    console.error(`${readmePath} command reference is stale. Run pnpm update-cli-readme.`)
    process.exitCode = 1
  }
} else {
  writeFileSync(readmePath, next)
}
