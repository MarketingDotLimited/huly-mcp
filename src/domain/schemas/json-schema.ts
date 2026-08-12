import { JsonSchema, Schema } from "effect"

const DRAFT_07_DEFINITIONS_REF = "#/definitions"
const MCP_DEFINITIONS_REF = "#/$defs"

const restoreMcpDefinitionRef = (ref: string): string =>
  ref === DRAFT_07_DEFINITIONS_REF || ref.startsWith(`${DRAFT_07_DEFINITIONS_REF}/`)
    ? `${MCP_DEFINITIONS_REF}${ref.slice(DRAFT_07_DEFINITIONS_REF.length)}`
    : ref

const JsonSchemaObjectSchema = Schema.Record(Schema.String, Schema.Json)
const JsonArraySchema = Schema.Array(Schema.Json)

type JsonSchemaObject = Schema.Schema.Type<typeof JsonSchemaObjectSchema>

const restoreMcpDefinitionRefsInJson = (value: Schema.Json): Schema.Json => {
  if (Array.isArray(value)) {
    return Schema.decodeUnknownSync(JsonArraySchema)(value).map(restoreMcpDefinitionRefsInJson)
  }
  if (typeof value !== "object" || value === null) return value

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      key === "$ref" && typeof nested === "string"
        ? restoreMcpDefinitionRef(nested)
        : restoreMcpDefinitionRefsInJson(nested)
    ])
  )
}

const restoreMcpDefinitionRefs = (schema: JsonSchema.JsonSchema): JsonSchemaObject => {
  const parsed = Schema.decodeUnknownSync(JsonSchemaObjectSchema)(schema)
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [
      key,
      key === "$ref" && typeof value === "string"
        ? restoreMcpDefinitionRef(value)
        : restoreMcpDefinitionRefsInJson(value)
    ])
  )
}

/**
 * Converts the encoded side of an Effect Schema to the Draft-07 document shape
 * exposed by MCP. Effect owns dialect conversion; this adapter only restores
 * the existing MCP `$defs` packaging after Draft-07 conversion.
 */
export const toDraft07JsonSchema = (schema: Schema.Constraint): JsonSchema.JsonSchema => {
  const draft07 = JsonSchema.toDocumentDraft07(Schema.toJsonSchemaDocument(schema))
  const definitions = Object.fromEntries(
    Object.entries(draft07.definitions).map(([name, definition]) => [name, restoreMcpDefinitionRefs(definition)])
  )

  return {
    $schema: JsonSchema.META_SCHEMA_URI_DRAFT_07,
    ...restoreMcpDefinitionRefs(draft07.schema),
    ...(Object.keys(definitions).length === 0 ? {} : { $defs: definitions })
  }
}

export const toDraft07EmptyObjectJsonSchema = (schema: Schema.Constraint): JsonSchema.JsonSchema => {
  const converted = toDraft07JsonSchema(schema)
  const definitions = parseJsonSchemaRecord(converted.$defs)
  return {
    $schema: converted.$schema,
    ...(definitions === undefined ? {} : { $defs: definitions }),
    type: "object",
    properties: {},
    additionalProperties: false
  }
}

type JsonSchemaPropertyDescriptions = Readonly<Partial<Record<string, string>>>

const JsonSchemaRecordSchema = Schema.Record(Schema.String, Schema.Unknown)

type JsonSchemaRecord = Schema.Schema.Type<typeof JsonSchemaRecordSchema>

export const parseJsonSchemaRecord = (value: unknown): JsonSchemaRecord | undefined => {
  try {
    return Schema.decodeUnknownSync(JsonSchemaRecordSchema)(value)
  } catch {
    return undefined
  }
}

export const withJsonSchemaPropertyDescriptions = (
  schema: object,
  descriptions: JsonSchemaPropertyDescriptions
): object => {
  const properties = parseJsonSchemaRecord(parseJsonSchemaRecord(schema)?.properties)
  if (properties === undefined) return schema
  return {
    ...schema,
    properties: Object.fromEntries(
      Object.entries(properties).map(([key, value]) => {
        const description = descriptions[key]
        const property = parseJsonSchemaRecord(value)
        return [key, description === undefined || property === undefined ? value : { ...property, description }]
      })
    )
  }
}

export const withExactlyOneRequired = <K extends string>(schema: object, fields: ReadonlyArray<K>): object => ({
  ...schema,
  oneOf: fields.map((field) => ({ required: [field] }))
})
