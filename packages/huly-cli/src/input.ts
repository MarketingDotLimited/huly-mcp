import * as fs from "node:fs/promises"

import { Effect, Schema } from "effect"

import type { ToolDefinition } from "../../../src/mcp/tools/registry.js"
import type { CliCommandSpec, CliOptionName } from "./catalog-types.js"
import { type CliGlobalOptions, type ParsedCliCommandLine } from "./cli-options.js"
import {
  collectFieldSpecs,
  fieldAcceptsBoolean,
  fieldAcceptsJson,
  fieldAcceptsNull,
  fieldAcceptsNumber,
  fieldAcceptsString,
  fieldNameToOptionName,
  fieldUsesBooleanOption,
  type FieldSpec
} from "./schema-fields.js"

export class CliInputError extends Schema.TaggedError<CliInputError>()("CliInputError", { message: Schema.String }) {}

export interface CliInvocation {
  readonly globals: CliGlobalOptions
  readonly input: Readonly<Record<string, unknown>>
}

const LONG_OPTION_PREFIX_LENGTH = 2
const LONG_OPTION_VALUE_PREFIX_OVERHEAD = 3
const NEGATED_OPTION_PREFIX_LENGTH = 3

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const parseJsonObjectText = (source: string, text: string): Effect.Effect<Record<string, unknown>, CliInputError> =>
  Effect.try({
    try: () => {
      const parsed: unknown = JSON.parse(text)
      return parsed
    },
    catch: (error) => new CliInputError({ message: `Invalid JSON in ${source}: ${String(error)}` })
  }).pipe(
    Effect.flatMap((parsed) =>
      isRecord(parsed)
        ? Effect.succeed(parsed)
        : Effect.fail(new CliInputError({ message: `${source} must contain a JSON object.` }))
    )
  )

const readTextFile = (path: string): Effect.Effect<string, CliInputError> =>
  Effect.tryPromise({
    try: () => fs.readFile(path, "utf8"),
    catch: (error) => new CliInputError({ message: `Failed to read ${path}: ${String(error)}` })
  })

const readBase64File = (path: string): Effect.Effect<string, CliInputError> =>
  Effect.tryPromise({
    try: async () => (await fs.readFile(path)).toString("base64"),
    catch: (error) => new CliInputError({ message: `Failed to read ${path}: ${String(error)}` })
  })

const parseBooleanValue = (fieldName: string, raw: string): Effect.Effect<boolean, CliInputError> => {
  const normalized = raw.toLowerCase()
  if (normalized === "true" || normalized === "1") return Effect.succeed(true)
  if (normalized === "false" || normalized === "0") return Effect.succeed(false)
  return Effect.fail(new CliInputError({ message: `Option ${fieldName} expects true or false.` }))
}

const parseNumberValue = (fieldName: string, raw: string): Effect.Effect<number, CliInputError> => {
  const value = Number(raw)
  return Number.isFinite(value)
    ? Effect.succeed(value)
    : Effect.fail(new CliInputError({ message: `Option ${fieldName} expects a number.` }))
}

const parseJsonValue = (fieldName: string, raw: string): Effect.Effect<unknown, CliInputError> =>
  Effect.try({
    try: () => {
      const parsed: unknown = JSON.parse(raw)
      return parsed
    },
    catch: (error) => new CliInputError({ message: `Option ${fieldName} has invalid JSON: ${String(error)}` })
  })

interface FieldCapabilities {
  readonly acceptsBoolean: boolean
  readonly acceptsJson: boolean
  readonly acceptsNumber: boolean
  readonly acceptsString: boolean
}

const fieldCapabilities = (rootSchema: object, field: FieldSpec): FieldCapabilities => ({
  acceptsBoolean: fieldAcceptsBoolean(rootSchema, field),
  acceptsJson: fieldAcceptsJson(rootSchema, field),
  acceptsNumber: fieldAcceptsNumber(rootSchema, field),
  acceptsString: fieldAcceptsString(rootSchema, field)
})

const isBooleanLiteral = (raw: string): boolean => ["0", "1", "false", "true"].includes(raw.toLowerCase())

const requiresBoolean = (capabilities: FieldCapabilities): boolean =>
  capabilities.acceptsBoolean && !capabilities.acceptsString && !capabilities.acceptsNumber && !capabilities.acceptsJson

const requiresNumber = (capabilities: FieldCapabilities): boolean =>
  capabilities.acceptsNumber && !capabilities.acceptsString && !capabilities.acceptsBoolean && !capabilities.acceptsJson

const looksLikeJsonContainer = (raw: string): boolean => raw.startsWith("[") || raw.startsWith("{")

const parseNullFieldValue = (
  rootSchema: object,
  field: FieldSpec,
  raw: string
): Effect.Effect<unknown, CliInputError> | undefined =>
  raw === "null" && fieldAcceptsNull(rootSchema, field) ? Effect.succeed(null) : undefined

const parseBooleanFieldValue = (
  capabilities: FieldCapabilities,
  fieldName: string,
  raw: string
): Effect.Effect<unknown, CliInputError> | undefined => {
  if (capabilities.acceptsBoolean && isBooleanLiteral(raw)) return parseBooleanValue(fieldName, raw)
  return requiresBoolean(capabilities) ? parseBooleanValue(fieldName, raw) : undefined
}

const parseNumberOrJsonFieldValue = (
  capabilities: FieldCapabilities,
  fieldName: string,
  raw: string
): Effect.Effect<unknown, CliInputError> | undefined => {
  if (capabilities.acceptsNumber && Number.isFinite(Number(raw))) return parseNumberValue(fieldName, raw)
  if (requiresNumber(capabilities)) return parseNumberValue(fieldName, raw)
  if (looksLikeJsonContainer(raw)) return parseJsonValue(fieldName, raw)
  if (capabilities.acceptsJson && !capabilities.acceptsString) return parseJsonValue(fieldName, raw)
  return undefined
}

const parseFieldValue = (rootSchema: object, field: FieldSpec, raw: string): Effect.Effect<unknown, CliInputError> => {
  const capabilities = fieldCapabilities(rootSchema, field)
  return (
    parseNullFieldValue(rootSchema, field, raw) ??
    parseBooleanFieldValue(capabilities, field.fieldName, raw) ??
    parseNumberOrJsonFieldValue(capabilities, field.fieldName, raw) ??
    Effect.succeed(raw)
  )
}

type CliJsonSourceName = "input-file" | "input-json"

interface CliJsonSourceOccurrence {
  readonly name: CliJsonSourceName
  readonly value: string
}

const jsonSourceOccurrence = (token: string, next: string | undefined): CliJsonSourceOccurrence | undefined => {
  for (const name of ["input-file", "input-json"] as const) {
    const flag = `--${name}`
    if (token === flag && next !== undefined) return { name, value: next }
    const inlinePrefix = `${flag}=`
    if (token.startsWith(inlinePrefix)) return { name, value: token.slice(inlinePrefix.length) }
  }
  return undefined
}

const collectJsonSourceOccurrences = (raw: ReadonlyArray<string>): ReadonlyArray<CliJsonSourceOccurrence> => {
  const occurrences: Array<CliJsonSourceOccurrence> = []
  const consumedValueIndexes = new Set<number>()
  for (const [index, token] of raw.entries()) {
    if (consumedValueIndexes.has(index)) continue
    const occurrence = jsonSourceOccurrence(token, raw[index + 1])
    if (occurrence !== undefined) {
      occurrences.push(occurrence)
      if (token === `--${occurrence.name}`) consumedValueIndexes.add(index + 1)
    }
  }
  return occurrences
}

const collectSourceInput = (raw: ReadonlyArray<string>): Effect.Effect<Record<string, unknown>, CliInputError> =>
  Effect.gen(function* () {
    let input: Record<string, unknown> = {}
    for (const source of collectJsonSourceOccurrences(raw)) {
      if (source.name === "input-json") {
        input = { ...input, ...(yield* parseJsonObjectText("--input-json", source.value)) }
      }
      if (source.name === "input-file") {
        const content = yield* readTextFile(source.value)
        input = { ...input, ...(yield* parseJsonObjectText(source.value, content)) }
      }
    }
    return input
  })

const collectPositionals = (
  spec: CliCommandSpec,
  positionals: ReadonlyArray<string>,
  rootSchema: object,
  fields: ReadonlyMap<CliOptionName, FieldSpec>
): Effect.Effect<Record<string, unknown>, CliInputError> =>
  Effect.gen(function* () {
    const unknownOption = positionals.find((value) => value.startsWith("--"))
    if (unknownOption !== undefined) {
      return yield* new CliInputError({ message: `Unknown option ${unknownOption}.` })
    }
    if (positionals.length > spec.positional.length) {
      return yield* new CliInputError({
        message: `Too many positional arguments. Expected ${spec.positional.length}, received ${positionals.length}.`
      })
    }

    const input: Record<string, unknown> = {}
    for (const [index, fieldName] of spec.positional.entries()) {
      const value = positionals[index]
      if (value !== undefined) {
        const optionName = fieldNameToOptionName(fieldName)
        const field = fields.get(optionName)
        input[fieldName] = field === undefined ? value : yield* parseFieldValue(rootSchema, field, value)
      }
    }
    return input
  })

interface ExplicitOptionOccurrence {
  readonly field: FieldSpec
  readonly kind: "base64-file" | "boolean" | "file" | "text"
  readonly value: boolean | string
}

const explicitOptionOccurrence = (
  token: string,
  next: string | undefined,
  fields: ReadonlyMap<CliOptionName, FieldSpec>,
  fileFields: ReadonlySet<string>,
  base64Fields: ReadonlySet<string>,
  rootSchema: object
): ExplicitOptionOccurrence | undefined => {
  if (!token.startsWith("--")) return undefined
  const equalsIndex = token.indexOf("=")
  const rawName = token.slice(LONG_OPTION_PREFIX_LENGTH, equalsIndex < 0 ? undefined : equalsIndex)
  const negated = rawName.startsWith("no-")
  const optionName = negated ? rawName.slice(NEGATED_OPTION_PREFIX_LENGTH) : rawName
  const inlineValue = equalsIndex < 0 ? undefined : token.slice(equalsIndex + 1)
  const directField = fields.get(optionName)
  if (directField !== undefined) {
    if (fieldUsesBooleanOption(rootSchema, directField)) {
      return {
        field: directField,
        kind: "boolean",
        value: negated ? false : (inlineValue ?? (next !== undefined && isBooleanLiteral(next) ? next : true))
      }
    }
    if (negated) return undefined
    return inlineValue === undefined && next === undefined
      ? undefined
      : { field: directField, kind: "text", value: inlineValue ?? next ?? "" }
  }
  if (negated) return undefined
  const base64Suffix = "-base64-file"
  const fileSuffix = "-file"
  const suffix = optionName.endsWith(base64Suffix)
    ? base64Suffix
    : optionName.endsWith(fileSuffix)
      ? fileSuffix
      : undefined
  if (suffix === undefined) return undefined
  const baseName = optionName.slice(0, -suffix.length)
  const field = fields.get(baseName)
  const allowed = suffix === base64Suffix ? base64Fields : fileFields
  if (field === undefined || !allowed.has(field.fieldName)) return undefined
  const kind = suffix === base64Suffix ? "base64-file" : "file"
  return inlineValue === undefined && next === undefined ? undefined : { field, kind, value: inlineValue ?? next ?? "" }
}

const collectExplicitOptionOccurrences = (
  raw: ReadonlyArray<string>,
  rootSchema: object,
  fields: ReadonlyMap<CliOptionName, FieldSpec>,
  spec: CliCommandSpec
): ReadonlyArray<ExplicitOptionOccurrence> => {
  const occurrences: Array<ExplicitOptionOccurrence> = []
  const fileFields = new Set(spec.behavior?.fileInput?.fields ?? [])
  const base64Fields = new Set(spec.behavior?.base64FileInput?.fields ?? [])
  for (let index = 0; index < raw.length; index += 1) {
    const token = raw[index]
    if (token === undefined) continue
    const occurrence = explicitOptionOccurrence(token, raw[index + 1], fields, fileFields, base64Fields, rootSchema)
    if (occurrence === undefined) continue
    occurrences.push(occurrence)
    if (!token.includes("=") && typeof occurrence.value === "string") index += 1
  }
  return occurrences
}

const explicitOccurrenceInput = (
  occurrence: ExplicitOptionOccurrence,
  rootSchema: object
): Effect.Effect<Record<string, unknown>, CliInputError> => {
  const fieldName = occurrence.field.fieldName
  switch (occurrence.kind) {
    case "base64-file":
      return readBase64File(String(occurrence.value)).pipe(Effect.map((value) => ({ [fieldName]: value })))
    case "boolean":
      return typeof occurrence.value === "boolean"
        ? Effect.succeed({ [fieldName]: occurrence.value })
        : parseBooleanValue(fieldName, occurrence.value).pipe(Effect.map((value) => ({ [fieldName]: value })))
    case "file":
      return readTextFile(String(occurrence.value)).pipe(Effect.map((value) => ({ [fieldName]: value })))
    case "text":
      return parseFieldValue(rootSchema, occurrence.field, String(occurrence.value)).pipe(
        Effect.map((value) => ({ [fieldName]: value }))
      )
  }
}

const collectExplicitOptions = (
  parsed: ParsedCliCommandLine,
  rootSchema: object,
  fields: ReadonlyMap<CliOptionName, FieldSpec>,
  spec: CliCommandSpec
): Effect.Effect<Record<string, unknown>, CliInputError> =>
  Effect.gen(function* () {
    const input: Record<string, unknown> = {}
    for (const occurrence of collectExplicitOptionOccurrences(parsed.raw, rootSchema, fields, spec)) {
      Object.assign(input, yield* explicitOccurrenceInput(occurrence, rootSchema))
    }
    return input
  })

const rawGlobalBooleanValue = (
  raw: ReadonlyArray<string>,
  name: "json" | "yes"
): Effect.Effect<boolean, CliInputError> => {
  const matching = raw.filter(
    (token) =>
      token === `--${name}` ||
      token === `--no-${name}` ||
      token.startsWith(`--${name}=`) ||
      token.startsWith(`--no-${name}=`)
  )
  const last = matching[matching.length - 1]
  if (last === undefined || last === `--no-${name}`) return Effect.succeed(false)
  if (last === `--${name}`) return Effect.succeed(true)
  return parseBooleanValue(name, last.slice(last.indexOf("=") + 1))
}

const lastTextOptionValue = (raw: ReadonlyArray<string>, name: string): string | undefined => {
  let value: string | undefined
  for (let index = 0; index < raw.length; index += 1) {
    const token = raw[index]
    if (token === `--${name}`) {
      value = raw[index + 1]
      index += 1
    } else if (token?.startsWith(`--${name}=`)) {
      value = token.slice(name.length + LONG_OPTION_VALUE_PREFIX_OVERHEAD)
    }
  }
  return value
}

const collectGlobalOptions = (raw: ReadonlyArray<string>): Effect.Effect<CliGlobalOptions, CliInputError> =>
  Effect.gen(function* () {
    const json = yield* rawGlobalBooleanValue(raw, "json")
    const yes = yield* rawGlobalBooleanValue(raw, "yes")
    const output = lastTextOptionValue(raw, "output")

    return output === undefined ? { json, yes } : { json, output, yes }
  })

export const buildCliInvocation = (
  tool: ToolDefinition,
  spec: CliCommandSpec,
  parsed: ParsedCliCommandLine
): Effect.Effect<CliInvocation, CliInputError> =>
  Effect.gen(function* () {
    const fields = collectFieldSpecs(tool.inputSchema)
    const sourceInput = yield* collectSourceInput(parsed.raw)
    const explicitInput = yield* collectExplicitOptions(parsed, tool.inputSchema, fields, spec)
    const positionalInput = yield* collectPositionals(spec, parsed.positionals, tool.inputSchema, fields)
    const globals = yield* collectGlobalOptions(parsed.raw)

    return { globals, input: { ...sourceInput, ...positionalInput, ...explicitInput } }
  })
