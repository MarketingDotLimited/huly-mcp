import { Ajv } from "ajv"
import { Schema } from "effect"

import { parseJsonSchemaRecord } from "../src/domain/schemas/json-schema.js"

const DRAFT_07_URI = "http://json-schema.org/draft-07/schema#"

const PublicToolSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  inputSchema: Schema.Record(Schema.String, Schema.Unknown),
  outputSchema: Schema.Record(Schema.String, Schema.Unknown)
})
type PublicTool = Schema.Schema.Type<typeof PublicToolSchema>
const PublicToolDiscoveryResultSchema = Schema.Struct({ tools: Schema.Array(PublicToolSchema) })

const decodeJsonPointerToken = (token: string): string => token.replaceAll("~1", "/").replaceAll("~0", "~")

const localDefinitionName = (ref: string): string | undefined => {
  if (!ref.startsWith("#/$defs/")) return undefined
  const token = ref.slice("#/$defs/".length).split("/")[0]
  return decodeJsonPointerToken(Schema.decodeUnknownSync(Schema.String)(token))
}

const inspectSchema = (value: unknown, definitions: Readonly<Record<string, unknown>>, path: string): void => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectSchema(entry, definitions, `${path}/${index}`))
    return
  }
  const record = parseJsonSchemaRecord(value)
  if (record === undefined) return
  if (Object.hasOwn(record, "prefixItems")) throw new Error(`${path} contains non-Draft-07 prefixItems.`)
  const ref = record.$ref
  if (typeof ref === "string") {
    if (ref.startsWith("#/definitions/")) throw new Error(`${path} contains an unrestored Draft-07 definition ref.`)
    const definition = localDefinitionName(ref)
    if (definition !== undefined && !Object.hasOwn(definitions, definition)) {
      throw new Error(`${path} contains unresolved local ref ${ref}.`)
    }
  }
  Object.entries(record).forEach(([key, child]) => inspectSchema(child, definitions, `${path}/${key}`))
}

const validateSchemaDocument = (
  toolName: string,
  surface: "input" | "output",
  schema: Readonly<Record<string, unknown>>
): void => {
  const record = schema
  if (record.$schema !== DRAFT_07_URI) {
    throw new Error(`${toolName} ${surface} schema must declare ${DRAFT_07_URI}.`)
  }
  const definitions = parseJsonSchemaRecord(record.$defs) ?? {}
  inspectSchema(record, definitions, `${toolName}/${surface}`)
  try {
    const ajv = new Ajv({ allErrors: true, formats: { uuid: true }, strict: true, strictRequired: false })
    ajv.compile(schema)
  } catch (error) {
    throw new Error(`${toolName} ${surface} schema is not valid Draft-07.`, { cause: error })
  }
}

export const validateDraft07ToolCorpus = (input: unknown): ReadonlyArray<PublicTool> => {
  const tools = Schema.decodeUnknownSync(Schema.Array(PublicToolSchema))(input)
  const names = new Set<string>()
  for (const tool of tools) {
    if (names.has(tool.name)) throw new Error(`Draft-07 corpus contains duplicate tool ${tool.name}.`)
    names.add(tool.name)
    validateSchemaDocument(tool.name, "input", tool.inputSchema)
    validateSchemaDocument(tool.name, "output", tool.outputSchema)
  }
  return tools
}

export const validateDraft07DiscoveryResult = (input: unknown): number => {
  const result = Schema.decodeUnknownSync(PublicToolDiscoveryResultSchema)(input)
  return validateDraft07ToolCorpus(result.tools).length
}

export interface RuntimeAgreementFixture {
  readonly name: string
  readonly schema: Schema.Constraint
  readonly jsonSchema: object
  readonly samples: ReadonlyArray<unknown>
}

export const verifyRuntimeDraft07Agreement = (fixture: RuntimeAgreementFixture): void => {
  const ajv = new Ajv({ allErrors: true, formats: { uuid: true }, strict: true, strictRequired: false })
  const validate = ajv.compile(fixture.jsonSchema)
  for (const sample of fixture.samples) {
    const runtimeAccepted = Schema.is(fixture.schema)(sample)
    const draftAccepted = validate(sample)
    if (runtimeAccepted !== draftAccepted) {
      throw new Error(
        `${fixture.name} runtime/Draft-07 disagreement for ${JSON.stringify(sample)}: runtime=${runtimeAccepted}, draft07=${draftAccepted}`
      )
    }
  }
}
