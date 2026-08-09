import { readFileSync, writeFileSync } from "node:fs"

import { cliCommandCatalog, isCliToolName } from "../packages/huly-cli/src/catalog.js"
import type { CliCommandSpec } from "../packages/huly-cli/src/catalog-types.js"
import { operationRegistry } from "../src/mcp/tools/index.js"
import {
  collectFieldSpecs,
  collectRequiredFieldNames,
  fieldAcceptsBoolean,
  fieldAcceptsJson,
  fieldAcceptsNull,
  fieldAcceptsNumber,
  fieldAcceptsString,
  type FieldSpec
} from "../packages/huly-cli/src/schema-fields.js"
import { cliFieldOptionDescription } from "../packages/huly-cli/src/field-help.js"
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

const escapeCell = (value: string): string => value.replaceAll("|", "\\|").replaceAll("\n", " ")

const fieldFlag = (spec: CliCommandSpec, rootSchema: object, field: FieldSpec): string => {
  const booleanOnly =
    fieldAcceptsBoolean(rootSchema, field) &&
    !fieldAcceptsString(rootSchema, field) &&
    !fieldAcceptsNumber(rootSchema, field) &&
    !fieldAcceptsNull(rootSchema, field) &&
    !fieldAcceptsJson(rootSchema, field)
  const syntax = booleanOnly
    ? `\`--${optionName(field.fieldName)}\` / \`--no-${optionName(field.fieldName)}\``
    : `\`--${optionName(field.fieldName)} <value>\``
  const description = cliFieldOptionDescription(spec, rootSchema, field)
  return description.length === 0 ? syntax : `${syntax} — ${escapeCell(description)}`
}

const fieldList = (fields: ReadonlyArray<string>): string => (fields.length === 0 ? "—" : fields.join("<br>"))

const commandRows = (): string =>
  Object.entries(cliCommandCatalog)
    .toSorted(([, left], [, right]) => left.path.join(" ").localeCompare(right.path.join(" ")))
    .map(([toolName, spec]) => {
      if (!isCliToolName(toolName)) throw new Error(`Unknown CLI catalog tool ${toolName}.`)
      const commandSpec: CliCommandSpec = spec
      const operation = operationRegistry.getOperation(toolName)
      const positional = new Set(commandSpec.positional)
      const fields = [...collectFieldSpecs(operation.inputSchema).values()]
      const required = collectRequiredFieldNames(operation.inputSchema)
      const positionals = commandSpec.positional.map((fieldName) => {
        const field = fields.find((candidate) => candidate.fieldName === fieldName)
        const description =
          field === undefined ? "" : cliFieldOptionDescription(commandSpec, operation.inputSchema, field)
        return description.length === 0 ? `\`<${fieldName}>\`` : `\`<${fieldName}>\` — ${escapeCell(description)}`
      })
      const requiredFlags = fields
        .filter((field) => !positional.has(field.fieldName) && required.has(field.fieldName))
        .map((field) => fieldFlag(commandSpec, operation.inputSchema, field))
      const optionalFlags = fields
        .filter((field) => !positional.has(field.fieldName) && !required.has(field.fieldName))
        .map((field) => fieldFlag(commandSpec, operation.inputSchema, field))
      const fileFlags = (commandSpec.behavior?.fileInput?.fields ?? []).map(
        (field) => `\`--${optionName(field)}-file <path>\` — read ${field} as text`
      )
      const base64FileFlags = (commandSpec.behavior?.base64FileInput?.fields ?? []).map(
        (field) => `\`--${optionName(field)}-base64-file <path>\` — encode local bytes as canonical base64`
      )
      const confirmation =
        explicitCliConfirmationMessage(toolName, commandSpec) === undefined ? "" : " Requires `--yes`."
      const output = commandSpec.behavior?.fileOutput === undefined ? "" : " Supports `--output <path>`."
      const command =
        `huly ${commandSpec.path.join(" ")} ${commandSpec.positional.map((field) => `<${field}>`).join(" ")}`.trim()
      return `| \`${command}\` | ${escapeCell(commandSpec.description)}${confirmation}${output} | ${fieldList(positionals)} | ${fieldList(requiredFlags)} | ${fieldList([...optionalFlags, ...fileFlags, ...base64FileFlags])} |`
    })
    .join("\n")

const generated = [
  startMarker,
  "<!-- Generated from cliCommandCatalog and shared operation schemas. Run `pnpm update-cli-readme`. -->",
  "## Complete command reference",
  "",
  "All commands also accept `--json`, `--input-json <object>`, and `--input-file <path>`. Explicit field flags override JSON sources. Structured fields accept JSON. Named positionals are required and are not duplicated as flags. Required non-positional inputs may instead be supplied through either JSON source.",
  "",
  "| Command | Purpose and behavior | Required positionals | Required inputs (flag or JSON) | Optional flags and alternatives |",
  "| --- | --- | --- | --- | --- |",
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
