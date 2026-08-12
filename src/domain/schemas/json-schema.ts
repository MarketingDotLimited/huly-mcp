import { JsonSchema, Schema, SchemaAST } from "effect"

const DRAFT_07_DEFINITIONS_REF = "#/definitions"
const MCP_DEFINITIONS_REF = "#/$defs"

const restoreMcpDefinitionRef = (ref: string): string =>
  ref === DRAFT_07_DEFINITIONS_REF || ref.startsWith(`${DRAFT_07_DEFINITIONS_REF}/`)
    ? `${MCP_DEFINITIONS_REF}${ref.slice(DRAFT_07_DEFINITIONS_REF.length)}`
    : ref

const JsonSchemaObjectSchema = Schema.Record(Schema.String, Schema.Json)
const JsonArraySchema = Schema.Array(Schema.Json)

type JsonSchemaObject = Schema.Schema.Type<typeof JsonSchemaObjectSchema>

const parseJsonObject = (value: Schema.Json): JsonSchemaObject | undefined => {
  try {
    return Schema.decodeUnknownSync(JsonSchemaObjectSchema)(value)
  } catch {
    return undefined
  }
}

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

const FLATTENABLE_ALLOF_KEYS = new Set([
  "description",
  "exclusiveMaximum",
  "exclusiveMinimum",
  "format",
  "maxItems",
  "maxLength",
  "maximum",
  "minItems",
  "minLength",
  "minimum",
  "multipleOf",
  "pattern",
  "title",
  "uniqueItems"
])

const flattenScalarAllOf = (value: Schema.Json): Schema.Json => {
  if (Array.isArray(value)) return Schema.decodeUnknownSync(JsonArraySchema)(value).map(flattenScalarAllOf)
  if (typeof value !== "object" || value === null) return value
  const record = Schema.decodeUnknownSync(JsonSchemaObjectSchema)(value)
  const recursivelyNormalized = Object.fromEntries(
    Object.entries(record).map(([key, nested]) => [key, flattenScalarAllOf(nested)])
  )
  const allOf = recursivelyNormalized.allOf
  if (!Array.isArray(allOf)) return recursivelyNormalized
  const members = Schema.decodeUnknownSync(JsonArraySchema)(allOf).map(parseJsonObject)
  if (
    members.some(
      (member) => member === undefined || Object.keys(member).some((key) => !FLATTENABLE_ALLOF_KEYS.has(key))
    )
  ) {
    return recursivelyNormalized
  }
  const memberKeys = members.flatMap((member) => (member === undefined ? [] : Object.keys(member)))
  if (new Set(memberKeys).size !== memberKeys.length) return recursivelyNormalized
  const merged = Object.assign({}, ...members)
  if (Object.keys(merged).some((key) => key in recursivelyNormalized && recursivelyNormalized[key] !== merged[key])) {
    return recursivelyNormalized
  }
  const withoutAllOf = Object.fromEntries(Object.entries(recursivelyNormalized).filter(([key]) => key !== "allOf"))
  return { ...withoutAllOf, ...merged }
}

const astDescription = (ast: SchemaAST.AST): string | undefined => {
  const direct = ast.context?.annotations?.description ?? ast.annotations?.description
  if (typeof direct === "string") return direct
  for (const check of ast.checks ?? []) {
    if (typeof check.annotations?.description === "string") return check.annotations.description
  }
  if (SchemaAST.isUnion(ast)) {
    const members = ast.types.filter((member) => !SchemaAST.isUndefined(member))
    const descriptions = members
      .map(astDescription)
      .filter((description): description is string => description !== undefined)
    if (members.length === 1) return descriptions[0]
    if (descriptions.length === members.length && new Set(descriptions).size === 1) return descriptions[0]
  }
  return undefined
}

const restoreAstPropertyDescriptions = (ast: SchemaAST.AST, jsonSchema: Schema.Json): Schema.Json => {
  const record = parseJsonObject(jsonSchema)
  if (record === undefined) return jsonSchema

  if (SchemaAST.isUnion(ast) && Array.isArray(record.anyOf)) {
    const members = ast.types.filter((member) => !SchemaAST.isUndefined(member))
    const anyOf = Schema.decodeUnknownSync(JsonArraySchema)(record.anyOf)
    return {
      ...record,
      anyOf: anyOf.map((member, index) => {
        const astMember = members[index]
        return astMember === undefined ? member : restoreAstPropertyDescriptions(astMember, member)
      })
    }
  }

  if (SchemaAST.isObjects(ast)) {
    const properties = record.properties === undefined ? undefined : parseJsonObject(record.properties)
    if (properties === undefined) return record
    const signatures = new Map(ast.propertySignatures.map((signature) => [signature.name, signature.type]))
    return {
      ...record,
      properties: Object.fromEntries(
        Object.entries(properties).map(([key, property]) => {
          const propertyAst = signatures.get(key)
          if (propertyAst === undefined) return [key, property]
          const restored = restoreAstPropertyDescriptions(propertyAst, property)
          const restoredRecord = parseJsonObject(restored)
          const description = astDescription(propertyAst)
          return [
            key,
            description === undefined || restoredRecord === undefined
              ? restored
              : restoredRecord.$ref === undefined
                ? { ...restoredRecord, description: restoredRecord.description ?? description }
                : { allOf: [{ $ref: restoredRecord.$ref }], description }
          ]
        })
      )
    }
  }

  if (SchemaAST.isArrays(ast) && record.items !== undefined) {
    const elementAst = ast.rest[0] ?? ast.elements[0]
    return elementAst === undefined
      ? record
      : { ...record, items: restoreAstPropertyDescriptions(elementAst, record.items) }
  }

  return record
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

  const document = flattenScalarAllOf({
    $schema: JsonSchema.META_SCHEMA_URI_DRAFT_07,
    ...restoreMcpDefinitionRefs(draft07.schema),
    ...(Object.keys(definitions).length === 0 ? {} : { $defs: definitions })
  })
  return Schema.decodeUnknownSync(JsonSchemaObjectSchema)(restoreAstPropertyDescriptions(schema.ast, document))
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

export const withJsonSchemaUnionPropertyDescriptions = (
  schema: object,
  descriptions: JsonSchemaPropertyDescriptions
): object => {
  const parsed = parseJsonSchemaRecord(schema)
  if (parsed === undefined || !Array.isArray(parsed.anyOf)) return schema
  return {
    ...parsed,
    anyOf: parsed.anyOf.map((member) => {
      const record = parseJsonSchemaRecord(member)
      return record === undefined ? member : withJsonSchemaPropertyDescriptions(record, descriptions)
    })
  }
}

export const withExactlyOneRequired = <K extends string>(schema: object, fields: ReadonlyArray<K>): object => ({
  ...schema,
  oneOf: fields.map((field) => ({ required: [field] }))
})
