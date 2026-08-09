export interface FieldSpec {
  readonly fieldName: string
  readonly schema: unknown
}

const MAX_SCHEMA_REF_DEPTH = 8

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const fieldNameToOptionName = (fieldName: string): string =>
  fieldName
    .replaceAll("_", "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()

const collectPropertyRecords = (schema: unknown): Array<Record<string, unknown>> => {
  if (!isRecord(schema)) return []

  const records: Array<Record<string, unknown>> = []
  if (isRecord(schema.properties)) {
    records.push(schema.properties)
  }

  for (const variantKey of ["allOf", "anyOf", "oneOf"]) {
    const variants = schema[variantKey]
    if (Array.isArray(variants)) {
      for (const variant of variants) {
        records.push(...collectPropertyRecords(variant))
      }
    }
  }

  return records
}

export const collectFieldSpecs = (schema: object): ReadonlyMap<string, FieldSpec> => {
  const fields = new Map<string, FieldSpec>()
  for (const properties of collectPropertyRecords(schema)) {
    for (const [fieldName, fieldSchema] of Object.entries(properties)) {
      fields.set(fieldNameToOptionName(fieldName), { fieldName, schema: fieldSchema })
    }
  }
  return fields
}

const localRefName = (ref: string): string | undefined => {
  const prefix = "#/$defs/"
  if (!ref.startsWith(prefix)) return undefined
  return decodeURIComponent(ref.slice(prefix.length))
}

const resolveLocalRef = (rootSchema: object, schema: unknown): unknown => {
  if (!isRecord(schema) || typeof schema.$ref !== "string" || !isRecord(rootSchema)) return schema
  const name = localRefName(schema.$ref)
  if (name === undefined || !isRecord(rootSchema.$defs)) return schema
  return rootSchema.$defs[name] ?? schema
}

const directRequiredFieldNames = (schema: Record<string, unknown>): ReadonlySet<string> =>
  new Set(
    Array.isArray(schema.required) ? schema.required.filter((name): name is string => typeof name === "string") : []
  )

const intersectSets = (sets: ReadonlyArray<ReadonlySet<string>>): ReadonlySet<string> => {
  const [first, ...rest] = sets
  return first === undefined ? new Set() : new Set([...first].filter((name) => rest.every((set) => set.has(name))))
}

const requiredFieldNamesFor = (schema: unknown): ReadonlySet<string> => {
  if (!isRecord(schema)) return new Set()
  const required = new Set(directRequiredFieldNames(schema))
  const allOf = Array.isArray(schema.allOf) ? schema.allOf : []
  for (const name of allOf.flatMap((variant) => [...requiredFieldNamesFor(variant)])) required.add(name)
  for (const variantKey of ["anyOf", "oneOf"]) {
    const variants = schema[variantKey]
    if (Array.isArray(variants)) {
      for (const name of intersectSets(variants.map(requiredFieldNamesFor))) required.add(name)
    }
  }
  return required
}

export const collectRequiredFieldNames = (schema: object): ReadonlySet<string> => requiredFieldNamesFor(schema)

const directSchemaTypeMatches = (schema: Record<string, unknown>, typeName: string): boolean =>
  schema.type === typeName || (Array.isArray(schema.type) && schema.type.includes(typeName))

const variantSchemaTypeMatches = (
  rootSchema: object,
  schema: Record<string, unknown>,
  typeName: string,
  depth: number
): boolean =>
  ["allOf", "anyOf", "oneOf"].some((variantKey) => {
    const variants = schema[variantKey]
    return (
      Array.isArray(variants) && variants.some((variant) => schemaHasType(rootSchema, variant, typeName, depth + 1))
    )
  })

const schemaHasType = (rootSchema: object, schema: unknown, typeName: string, depth = 0): boolean => {
  if (depth > MAX_SCHEMA_REF_DEPTH || !isRecord(schema)) return false
  const resolved = resolveLocalRef(rootSchema, schema)
  if (!isRecord(resolved)) return false

  return directSchemaTypeMatches(resolved, typeName) || variantSchemaTypeMatches(rootSchema, resolved, typeName, depth)
}

export const fieldAcceptsBoolean = (rootSchema: object, field: FieldSpec): boolean =>
  schemaHasType(rootSchema, field.schema, "boolean")

export const fieldAcceptsNull = (rootSchema: object, field: FieldSpec): boolean =>
  schemaHasType(rootSchema, field.schema, "null")

export const fieldAcceptsNumber = (rootSchema: object, field: FieldSpec): boolean =>
  schemaHasType(rootSchema, field.schema, "integer") || schemaHasType(rootSchema, field.schema, "number")

export const fieldAcceptsString = (rootSchema: object, field: FieldSpec): boolean =>
  schemaHasType(rootSchema, field.schema, "string")

export const fieldAcceptsJson = (rootSchema: object, field: FieldSpec): boolean =>
  schemaHasType(rootSchema, field.schema, "array") || schemaHasType(rootSchema, field.schema, "object")

const fieldSchemaDescription = (rootSchema: object, field: FieldSpec): string | undefined => {
  if (!isRecord(field.schema)) return undefined
  const resolved = resolveLocalRef(rootSchema, field.schema)
  const direct = typeof field.schema.description === "string" ? field.schema.description : undefined
  return direct ?? (isRecord(resolved) && typeof resolved.description === "string" ? resolved.description : undefined)
}

export const fieldOptionDescription = (rootSchema: object, field: FieldSpec): string => {
  const description = fieldSchemaDescription(rootSchema, field)
  const json = fieldAcceptsJson(rootSchema, field) ? "Pass arrays or objects as JSON." : undefined
  const nullable = fieldAcceptsNull(rootSchema, field) ? "Pass null to clear the field." : undefined
  return [description, json, nullable].filter((part) => part !== undefined).join(" ")
}
