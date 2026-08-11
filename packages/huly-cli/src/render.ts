import type { Effect } from "effect"
import { Console, Schema } from "effect"

import { SupportedAttachmentImageTypeSchema } from "../../../src/domain/schemas/attachments.js"
import { Count } from "../../../src/domain/schemas/shared.js"
import { ToolWarningSchema } from "../../../src/domain/schemas/tool-warnings.js"
import type { ToolOperationSuccess } from "../../../src/mcp/tools/registry.js"
import type { CliHumanRendering } from "./catalog-types.js"
import type { CliGlobalOptions } from "./cli-options.js"

const DEFAULT_RUNTIME_ERROR_KIND = "integration"

export class CliRuntimeError extends Schema.TaggedError<CliRuntimeError>()("CliRuntimeError", {
  message: Schema.String,
  kind: Schema.optionalWith(
    Schema.Literal(
      "ambiguity",
      "authentication",
      "authorization",
      "conflict",
      "input",
      "integration",
      "internal",
      "lookup"
    ),
    { default: () => DEFAULT_RUNTIME_ERROR_KIND }
  ),
  retryable: Schema.optionalWith(Schema.Boolean, { default: () => false })
}) {}

const MAX_TABLE_COLUMNS = 6
const MAX_CELL_LENGTH = 80
const ELLIPSIS_LENGTH = 3
const JSON_INDENT_SPACES = 2
const TABLE_COLUMN_GAP = 2
const ANSI_BOLD = "\u001b[1m"
const ANSI_RESET = "\u001b[0m"

export interface CliRenderOptions {
  readonly color: boolean
  readonly human?: CliHumanRendering
  readonly terminalWidth: number
}

interface CliTerminalContext {
  readonly columns: number | undefined
  readonly isTTY: boolean
  readonly noColor: boolean
}

const defaultRenderOptions: CliRenderOptions = { color: false, terminalWidth: 100 }

export const renderOptionsForTerminal = (
  terminal: CliTerminalContext,
  human?: CliHumanRendering
): CliRenderOptions => ({
  color: terminal.isTTY && !terminal.noColor,
  ...(human === undefined ? {} : { human }),
  terminalWidth: terminal.columns ?? defaultRenderOptions.terminalWidth
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const scalarText = (value: unknown): string => {
  if (value === null) return "null"
  if (value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  const encoded = JSON.stringify(value)
  return typeof encoded === "string" ? encoded : ""
}

const truncate = (value: string): string =>
  value.length > MAX_CELL_LENGTH ? `${value.slice(0, MAX_CELL_LENGTH - ELLIPSIS_LENGTH)}...` : value

const scalarKeys = (record: Record<string, unknown>): Array<string> =>
  Object.keys(record).filter((key) => {
    const value = record[key]
    return (
      value === null ||
      value === undefined ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    )
  })

interface RenderColumn {
  readonly field: string
  readonly label: string
  readonly priority: number
  readonly reusable: boolean
}

const inferredReusableField = (field: string): boolean =>
  field === "id" || field.endsWith("Id") || field === "identifier" || field.endsWith("Identifier")

const tableColumns = (
  rows: ReadonlyArray<Record<string, unknown>>,
  first: Record<string, unknown>,
  human: CliHumanRendering | undefined
): ReadonlyArray<RenderColumn> => {
  const configured = human?.columns
    .filter(({ field }) => rows.some((row) => Object.hasOwn(row, field)))
    .map(({ field, label, priority, reusable }) => ({
      field,
      label: label ?? field,
      priority,
      reusable: reusable ?? false
    }))
  if (configured !== undefined && configured.length > 0) return configured
  return scalarKeys(first)
    .slice(0, MAX_TABLE_COLUMNS)
    .map((field, index) => ({
      field,
      label: field,
      priority: MAX_TABLE_COLUMNS - index,
      reusable: inferredReusableField(field)
    }))
}

const naturalColumnWidth = (rows: ReadonlyArray<Record<string, unknown>>, column: RenderColumn): number =>
  Math.max(
    column.label.length,
    ...rows.map((row) => {
      const value = scalarText(row[column.field])
      return column.reusable ? value.length : truncate(value).length
    })
  )

const tableWidth = (widths: ReadonlyArray<number>): number =>
  widths.reduce((total, width) => total + width, Math.max(0, widths.length - 1) * TABLE_COLUMN_GAP)

const columnsWithinWidth = (
  rows: ReadonlyArray<Record<string, unknown>>,
  columns: ReadonlyArray<RenderColumn>,
  terminalWidth: number
): ReadonlyArray<RenderColumn> => {
  const byPriority = [...columns].sort((left, right) => right.priority - left.priority)
  const selected: Array<RenderColumn> = []
  for (const column of byPriority) {
    const candidate = [...selected, column]
    const widths = candidate.map((item) => naturalColumnWidth(rows, item))
    if (selected.length === 0 || tableWidth(widths) <= terminalWidth) selected.push(column)
  }
  return selected.sort((left, right) => columns.indexOf(left) - columns.indexOf(right))
}

const renderTable = (rows: ReadonlyArray<Record<string, unknown>>, options: CliRenderOptions): string => {
  const [firstRow] = rows
  if (firstRow === undefined) return "No results."

  const columns = columnsWithinWidth(rows, tableColumns(rows, firstRow, options.human), options.terminalWidth)
  if (columns.length === 0) return JSON.stringify(rows, null, JSON_INDENT_SPACES)

  const renderColumns = columns.map((column) => ({ ...column, width: naturalColumnWidth(rows, column) }))
  const heading = renderColumns.map((column) => column.label.padEnd(column.width)).join("  ")
  const line = options.color ? `${ANSI_BOLD}${heading}${ANSI_RESET}` : heading
  const separator = renderColumns.map((column) => "-".repeat(column.width)).join("  ")
  const body = rows.map((row) =>
    renderColumns
      .map((column) => {
        const value = scalarText(row[column.field])
        return (column.reusable ? value : truncate(value)).padEnd(column.width)
      })
      .join("  ")
  )
  return [line, separator, ...body].join("\n")
}

const firstArrayProperty = (
  result: Record<string, unknown>
): readonly [key: string, rows: ReadonlyArray<Record<string, unknown>>] | undefined => {
  for (const [key, value] of Object.entries(result)) {
    if (Array.isArray(value) && value.every(isRecord)) {
      return [key, value]
    }
  }
  return undefined
}

const renderObjectSummary = (result: Record<string, unknown>, options: CliRenderOptions): string => {
  const table = firstArrayProperty(result)
  if (table !== undefined) {
    const [key, rows] = table
    const total = typeof result.total === "number" || typeof result.total === "string" ? `\nTotal: ${result.total}` : ""
    return `${key}:\n${renderTable(rows, options)}${total}`
  }

  return Object.entries(result)
    .map(([key, value]) => `${key}: ${scalarText(value)}`)
    .join("\n")
}

const renderHuman = (result: unknown, options: CliRenderOptions): string => {
  if (Array.isArray(result) && result.every(isRecord)) return renderTable(result, options)
  if (isRecord(result)) return renderObjectSummary(result, options)
  return scalarText(result)
}

const renderWarnings = (warnings: ToolOperationSuccess["warnings"]): string =>
  warnings.map((warning) => `- ${warning.code}: ${warning.message}`).join("\n")

const CliImageDescriptorSchema = Schema.Struct({
  mimeType: SupportedAttachmentImageTypeSchema,
  encoding: Schema.Literal("base64"),
  base64Length: Count
})
const CliJsonImageResultSchema = Schema.Struct({ result: Schema.Unknown, image: CliImageDescriptorSchema })
const CliJsonWarningResultSchema = Schema.Struct({
  result: Schema.Unknown,
  warnings: Schema.NonEmptyArray(ToolWarningSchema)
})
const CliJsonImageWarningResultSchema = Schema.Struct({
  result: Schema.Unknown,
  image: CliImageDescriptorSchema,
  warnings: Schema.NonEmptyArray(ToolWarningSchema)
})
export const CliJsonWrappedResultSchema = Schema.Union(
  CliJsonImageWarningResultSchema,
  CliJsonImageResultSchema,
  CliJsonWarningResultSchema
)

const imageDescriptor = (image: NonNullable<ToolOperationSuccess["image"]>) =>
  Schema.encodeSync(CliImageDescriptorSchema)({
    mimeType: image.mimeType,
    encoding: "base64",
    base64Length: Count.make(image.data.length)
  })

const renderJsonResult = (success: ToolOperationSuccess): string => {
  const jsonOutput =
    success.warnings.length === 0 && success.image === undefined
      ? success.result
      : Schema.decodeUnknownSync(CliJsonWrappedResultSchema)({
          result: success.result,
          ...(success.image === undefined ? {} : { image: imageDescriptor(success.image) }),
          ...(success.warnings.length === 0 ? {} : { warnings: success.warnings })
        })
  return JSON.stringify(jsonOutput, null, JSON_INDENT_SPACES)
}

const renderHumanResult = (success: ToolOperationSuccess, options: CliRenderOptions): string => {
  const output = renderHuman(success.result, options)
  const withImage =
    success.image === undefined
      ? output
      : `${output}\n\nImage: ${success.image.mimeType} (${success.image.data.length} base64 characters)`
  return success.warnings.length === 0 ? withImage : `${withImage}\n\nWarnings:\n${renderWarnings(success.warnings)}`
}

export const renderOperationResult = (
  success: ToolOperationSuccess,
  globals: CliGlobalOptions,
  options: CliRenderOptions = defaultRenderOptions
): string => {
  return globals.json ? renderJsonResult(success) : renderHumanResult(success, options)
}

export const renderOperationSuccess = (
  success: ToolOperationSuccess,
  globals: CliGlobalOptions,
  human?: CliHumanRendering
): Effect.Effect<void, CliRuntimeError> =>
  Console.log(
    renderOperationResult(
      success,
      globals,
      renderOptionsForTerminal(
        {
          columns: process.stdout.columns,
          isTTY: process.stdout.isTTY === true,
          noColor: process.env["NO_COLOR"] !== undefined
        },
        human
      )
    )
  )
