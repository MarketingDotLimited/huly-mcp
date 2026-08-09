import { Args, CliConfig, Options } from "@effect/cli"
import type { NodeContext } from "@effect/platform-node"
import { Effect, Option } from "effect"

import type { ToolDefinition } from "../../../src/mcp/tools/registry.js"
import type { CliCommandSpec, CliOptionName, CliSchemaFieldName } from "./catalog-types.js"
import {
  collectFieldSpecs,
  collectRequiredFieldNames,
  fieldUsesBooleanOption,
  type FieldSpec
} from "./schema-fields.js"
import { cliFieldOptionDescription } from "./field-help.js"

export interface CliGlobalOptions {
  readonly json: boolean
  readonly yes: boolean
  readonly output?: string
}

interface ParsedFieldOption {
  readonly _tag: "FieldOption"
  readonly fieldName: CliSchemaFieldName
  readonly optionName: CliOptionName
  readonly value: string
}

interface ParsedBooleanFieldOption {
  readonly _tag: "BooleanFieldOption"
  readonly fieldName: CliSchemaFieldName
  readonly optionName: CliOptionName
  readonly value: boolean
}

interface ParsedFileFieldOption {
  readonly _tag: "FileFieldOption"
  readonly fieldName: CliSchemaFieldName
  readonly optionName: CliOptionName
  readonly path: string
}

interface ParsedBase64FileFieldOption {
  readonly _tag: "Base64FileFieldOption"
  readonly fieldName: CliSchemaFieldName
  readonly optionName: CliOptionName
  readonly path: string
}

interface ParsedGlobalOption {
  readonly _tag: "GlobalOption"
  readonly name: "input-file" | "input-json" | "output"
  readonly value: string
}

interface ParsedGlobalBooleanOption {
  readonly _tag: "GlobalBooleanOption"
  readonly name: "json" | "yes"
  readonly value: boolean
}

export type ParsedCliOption =
  | ParsedBase64FileFieldOption
  | ParsedBooleanFieldOption
  | ParsedFieldOption
  | ParsedFileFieldOption
  | ParsedGlobalBooleanOption
  | ParsedGlobalOption

export interface ParsedCliCommandLine {
  readonly options: ReadonlyArray<ParsedCliOption>
  readonly positionals: ReadonlyArray<string>
  readonly raw: ReadonlyArray<string>
}

const emptyOptions: ReadonlyArray<ParsedCliOption> = []

const optionalTextOption = (
  name: string,
  makeOption: (value: string) => ParsedCliOption
): Options.Options<ReadonlyArray<ParsedCliOption>> =>
  Options.text(name).pipe(
    Options.optional,
    Options.map((value) => Option.match(value, { onNone: () => emptyOptions, onSome: (text) => [makeOption(text)] }))
  )

const booleanOption = (name: "json" | "yes"): Options.Options<ReadonlyArray<ParsedCliOption>> =>
  Options.boolean(name, { negationNames: [`no-${name}`] }).pipe(
    Options.map((value) => [{ _tag: "GlobalBooleanOption", name, value }])
  )

const fieldHelp = (spec: CliCommandSpec, rootSchema: object, field: FieldSpec, required: boolean): string => {
  const description = cliFieldOptionDescription(spec, rootSchema, field)
  const requirement = required ? "Required unless supplied through --input-json or --input-file." : undefined
  return [description, requirement].filter((part) => part !== undefined && part.length > 0).join(" ")
}

const fieldTextOption = (
  rootSchema: object,
  spec: CliCommandSpec,
  optionName: CliOptionName,
  field: FieldSpec,
  required: boolean
): Options.Options<ReadonlyArray<ParsedCliOption>> =>
  optionalTextOption(optionName, (value) => ({
    _tag: "FieldOption",
    fieldName: field.fieldName,
    optionName,
    value
  })).pipe(Options.withDescription(fieldHelp(spec, rootSchema, field, required)))

const fieldBooleanOption = (
  rootSchema: object,
  spec: CliCommandSpec,
  optionName: CliOptionName,
  field: FieldSpec,
  required: boolean
): Options.Options<ReadonlyArray<ParsedCliOption>> =>
  Options.boolean(optionName, { negationNames: [`no-${optionName}`] }).pipe(
    Options.map(
      (value): ReadonlyArray<ParsedCliOption> => [
        { _tag: "BooleanFieldOption", fieldName: field.fieldName, optionName, value }
      ]
    ),
    Options.withDescription(fieldHelp(spec, rootSchema, field, required))
  )

const fieldFileOption = (
  optionName: CliOptionName,
  field: FieldSpec
): Options.Options<ReadonlyArray<ParsedCliOption>> =>
  optionalTextOption(`${optionName}-file`, (path) => ({
    _tag: "FileFieldOption",
    fieldName: field.fieldName,
    optionName,
    path
  })).pipe(Options.withDescription(`Read ${field.fieldName} text from this file.`))

const fieldBase64FileOption = (
  optionName: CliOptionName,
  field: FieldSpec
): Options.Options<ReadonlyArray<ParsedCliOption>> =>
  optionalTextOption(`${optionName}-base64-file`, (path) => ({
    _tag: "Base64FileFieldOption",
    fieldName: field.fieldName,
    optionName,
    path
  })).pipe(Options.withDescription(`Read this file as bytes and pass ${field.fieldName} as canonical base64.`))

const fieldOptions = (
  rootSchema: object,
  spec: CliCommandSpec,
  fields: ReadonlyMap<CliOptionName, FieldSpec>,
  requiredFields: ReadonlySet<CliSchemaFieldName>,
  fileInputFields: ReadonlySet<CliSchemaFieldName>,
  base64FileInputFields: ReadonlySet<CliSchemaFieldName>
): Array<Options.Options<ReadonlyArray<ParsedCliOption>>> => {
  const descriptors: Array<Options.Options<ReadonlyArray<ParsedCliOption>>> = []
  for (const [optionName, field] of fields) {
    descriptors.push(
      fieldUsesBooleanOption(rootSchema, field)
        ? fieldBooleanOption(rootSchema, spec, optionName, field, requiredFields.has(field.fieldName))
        : fieldTextOption(rootSchema, spec, optionName, field, requiredFields.has(field.fieldName))
    )
    if (fileInputFields.has(field.fieldName)) {
      descriptors.push(fieldFileOption(optionName, field))
    }
    if (base64FileInputFields.has(field.fieldName)) {
      descriptors.push(fieldBase64FileOption(optionName, field))
    }
  }
  return descriptors
}

const globalOptions: ReadonlyArray<Options.Options<ReadonlyArray<ParsedCliOption>>> = [
  booleanOption("json").pipe(Options.withDescription("Print the operation result as JSON.")),
  booleanOption("yes").pipe(Options.withDescription("Confirm a consequential operation.")),
  optionalTextOption("input-json", (value) => ({ _tag: "GlobalOption", name: "input-json", value })).pipe(
    Options.withDescription("Merge this JSON object into operation input before explicit field flags.")
  ),
  optionalTextOption("input-file", (value) => ({ _tag: "GlobalOption", name: "input-file", value })).pipe(
    Options.withDescription("Merge a JSON object from this file before explicit field flags.")
  ),
  optionalTextOption("output", (value) => ({ _tag: "GlobalOption", name: "output", value })).pipe(
    Options.withDescription("Write supported attachment or image bytes to this path.")
  )
]

const flattenOptions = (parsed: ReadonlyArray<ReadonlyArray<ParsedCliOption>>): ReadonlyArray<ParsedCliOption> =>
  parsed.flat()

interface BehaviorFieldSets {
  readonly base64: ReadonlySet<CliSchemaFieldName>
  readonly text: ReadonlySet<CliSchemaFieldName>
}

const behaviorFieldSets = (fields: ReadonlyMap<CliOptionName, FieldSpec>, spec: CliCommandSpec): BehaviorFieldSets => {
  const fileInputFields = new Set(spec.behavior?.fileInput?.fields ?? [])
  const base64FileInputFields = new Set(spec.behavior?.base64FileInput?.fields ?? [])
  const schemaFieldNames = new Set([...fields.values()].map((field) => field.fieldName))
  const unknownBehaviorFields = [...fileInputFields, ...base64FileInputFields].filter(
    (fieldName) => !schemaFieldNames.has(fieldName)
  )
  if (unknownBehaviorFields.length > 0) {
    throw new Error(`CLI behavior references unknown schema fields: ${unknownBehaviorFields.join(", ")}.`)
  }
  return { text: fileInputFields, base64: base64FileInputFields }
}

const positionalArgs = (tool: ToolDefinition, spec: CliCommandSpec, fields: ReadonlyMap<CliOptionName, FieldSpec>) => {
  const requiredFields = collectRequiredFieldNames(tool.inputSchema)
  const namedPositionals = spec.positional.map((fieldName) => {
    if (!requiredFields.has(fieldName)) {
      throw new Error(`CLI positional ${fieldName} is not an unconditionally required schema field.`)
    }
    const field = [...fields.values()].find((candidate) => candidate.fieldName === fieldName)
    const argument = Args.text({ name: fieldName })
    return field === undefined
      ? argument
      : argument.pipe(Args.withDescription(cliFieldOptionDescription(spec, tool.inputSchema, field)))
  })
  return namedPositionals.length === 0
    ? Args.none.pipe(Args.map((): ReadonlyArray<string> => []))
    : Args.all(namedPositionals)
}

export const buildCliCommandConfig = (tool: ToolDefinition, spec: CliCommandSpec) => {
  const fields = collectFieldSpecs(tool.inputSchema)
  const behaviorFields = behaviorFieldSets(fields, spec)
  const options = Options.all([
    ...globalOptions,
    ...fieldOptions(
      tool.inputSchema,
      spec,
      new Map([...fields].filter(([, field]) => !spec.positional.includes(field.fieldName))),
      collectRequiredFieldNames(tool.inputSchema),
      behaviorFields.text,
      behaviorFields.base64
    )
  ]).pipe(Options.map(flattenOptions))
  return { options, positionals: positionalArgs(tool, spec, fields) }
}

export const buildGlobalOptionsConfig = () => ({
  options: Options.all(globalOptions).pipe(Options.map(flattenOptions))
})

export const parseCliCommandLine = (
  tool: ToolDefinition,
  spec: CliCommandSpec,
  raw: ReadonlyArray<string>
): Effect.Effect<ParsedCliCommandLine, unknown, NodeContext.NodeContext> => {
  const config = buildCliCommandConfig(tool, spec)
  return Options.processCommandLine(config.options, raw, CliConfig.defaultConfig).pipe(
    Effect.flatMap(([error, rest, options]) =>
      Option.match(error, { onNone: () => Effect.succeed({ options, positionals: rest, raw }), onSome: Effect.fail })
    )
  )
}

export const parseGlobalCommandLine = (
  raw: ReadonlyArray<string>
): Effect.Effect<ReadonlyArray<ParsedCliOption>, unknown, NodeContext.NodeContext> =>
  Options.processCommandLine(buildGlobalOptionsConfig().options, raw, CliConfig.defaultConfig).pipe(
    Effect.flatMap(([error, , options]) =>
      Option.match(error, { onNone: () => Effect.succeed(options), onSome: Effect.fail })
    )
  )

export const rawOptionPresent = (raw: ReadonlyArray<string>, optionName: string): boolean =>
  raw.some(
    (token) =>
      token === `--${optionName}` ||
      token.startsWith(`--${optionName}=`) ||
      token === `--no-${optionName}` ||
      token.startsWith(`--no-${optionName}=`)
  )

export const rawOptionInlineValue = (raw: ReadonlyArray<string>, optionName: string): string | undefined => {
  const positivePrefix = `--${optionName}=`
  const negativePrefix = `--no-${optionName}=`
  const token = raw.find((value) => value.startsWith(positivePrefix) || value.startsWith(negativePrefix))
  if (token === undefined) return undefined
  const equalsIndex = token.indexOf("=")
  return token.slice(equalsIndex + 1)
}
