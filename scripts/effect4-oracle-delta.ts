import { Schema } from "effect"

import { canonicalJson, isJsonValue, type JsonValue } from "./effect4-oracle-canonical.js"

const JsonValueSchema = Schema.declare(isJsonValue)
const decodeJsonValue = Schema.decodeUnknownSync(JsonValueSchema)

const JsonPointerSchema = Schema.String.pipe(Schema.check(Schema.isPattern(/^(?:\/(?:[^~/]|~0|~1)*)*$/u)))

const AddedDeltaSchema = Schema.Struct({
  _tag: Schema.Literal("Added"),
  path: JsonPointerSchema,
  after: JsonValueSchema
})
const RemovedDeltaSchema = Schema.Struct({
  _tag: Schema.Literal("Removed"),
  path: JsonPointerSchema,
  before: JsonValueSchema
})
const ChangedDeltaSchema = Schema.Struct({
  _tag: Schema.Literal("Changed"),
  path: JsonPointerSchema,
  before: JsonValueSchema,
  after: JsonValueSchema
})

export const OracleDeltaSchema = Schema.Union([AddedDeltaSchema, RemovedDeltaSchema, ChangedDeltaSchema])
export type OracleDelta = Schema.Schema.Type<typeof OracleDeltaSchema>

const IntentionalAddedDeltaSchema = Schema.Struct({
  ...AddedDeltaSchema.fields,
  rationale: Schema.NonEmptyString,
  issue: Schema.NonEmptyString
})
const IntentionalRemovedDeltaSchema = Schema.Struct({
  ...RemovedDeltaSchema.fields,
  rationale: Schema.NonEmptyString,
  issue: Schema.NonEmptyString
})
const IntentionalChangedDeltaSchema = Schema.Struct({
  ...ChangedDeltaSchema.fields,
  rationale: Schema.NonEmptyString,
  issue: Schema.NonEmptyString
})

export const IntentionalOracleDeltaSchema = Schema.Union([
  IntentionalAddedDeltaSchema,
  IntentionalRemovedDeltaSchema,
  IntentionalChangedDeltaSchema
])
export type IntentionalOracleDelta = Schema.Schema.Type<typeof IntentionalOracleDeltaSchema>

const isRecord = (value: JsonValue): value is Readonly<Record<string, JsonValue>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const isArray = (value: JsonValue): value is ReadonlyArray<JsonValue> => Array.isArray(value)

const escapePointerPart = (part: string): string => part.replaceAll("~", "~0").replaceAll("/", "~1")
const childPath = (path: string, part: string | number): string => `${path}/${escapePointerPart(String(part))}`
const arrayValueAt = (values: ReadonlyArray<JsonValue>, index: number): JsonValue => decodeJsonValue(values[index])

const compareAt = (before: JsonValue, after: JsonValue, path: string): ReadonlyArray<OracleDelta> => {
  if (canonicalJson(before) === canonicalJson(after)) return []
  if (isArray(before) && isArray(after)) {
    const sharedLength = Math.min(before.length, after.length)
    const changed = Array.from({ length: sharedLength }, (_, index) =>
      compareAt(arrayValueAt(before, index), arrayValueAt(after, index), childPath(path, index))
    ).flat()
    const removed = before
      .slice(after.length)
      .map(
        (value, offset) => ({ _tag: "Removed", path: childPath(path, after.length + offset), before: value }) as const
      )
    const added = after
      .slice(before.length)
      .map((value, offset) => ({ _tag: "Added", path: childPath(path, before.length + offset), after: value }) as const)
    return [...changed, ...removed, ...added]
  }
  if (isRecord(before) && isRecord(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    return keys.flatMap((key) => {
      const beforeHasKey = Object.hasOwn(before, key)
      const afterHasKey = Object.hasOwn(after, key)
      if (!beforeHasKey) return [{ _tag: "Added", path: childPath(path, key), after: decodeJsonValue(after[key]) }]
      if (!afterHasKey) return [{ _tag: "Removed", path: childPath(path, key), before: decodeJsonValue(before[key]) }]
      return compareAt(decodeJsonValue(before[key]), decodeJsonValue(after[key]), childPath(path, key))
    })
  }
  return [{ _tag: "Changed", path, before, after }]
}

export const compareOracleValues = (before: JsonValue, after: JsonValue): ReadonlyArray<OracleDelta> =>
  compareAt(before, after, "")

export const oracleDeltaIdentity = (delta: OracleDelta | IntentionalOracleDelta): string => {
  switch (delta._tag) {
    case "Added":
      return canonicalJson({ _tag: delta._tag, after: delta.after, path: delta.path })
    case "Removed":
      return canonicalJson({ _tag: delta._tag, before: delta.before, path: delta.path })
    case "Changed":
      return canonicalJson({ _tag: delta._tag, after: delta.after, before: delta.before, path: delta.path })
  }
}

export interface OracleDeltaClassification {
  readonly unexpected: ReadonlyArray<OracleDelta>
  readonly stale: ReadonlyArray<IntentionalOracleDelta>
  readonly duplicateIntentional: ReadonlyArray<IntentionalOracleDelta>
}

export interface OracleDeltaReport extends OracleDeltaClassification {
  readonly bySurface: Readonly<Record<string, number>>
  readonly total: number
}

const pointerSurface = (path: string): string => {
  const token = path.split("/")[1]
  return token === undefined || token === "" ? "root" : token.replaceAll("~1", "/").replaceAll("~0", "~")
}

export const classifyOracleDeltas = (
  deltas: ReadonlyArray<OracleDelta>,
  intentional: ReadonlyArray<IntentionalOracleDelta>
): OracleDeltaClassification => {
  const actual = new Set(deltas.map(oracleDeltaIdentity))
  const allowed = new Set(intentional.map(oracleDeltaIdentity))
  const seen = new Set<string>()
  const duplicateIntentional = intentional.filter((delta) => {
    const identity = oracleDeltaIdentity(delta)
    if (seen.has(identity)) return true
    seen.add(identity)
    return false
  })
  return {
    unexpected: deltas.filter((delta) => !allowed.has(oracleDeltaIdentity(delta))),
    stale: intentional.filter((delta) => !actual.has(oracleDeltaIdentity(delta))),
    duplicateIntentional
  }
}

export const createOracleDeltaReport = (
  deltas: ReadonlyArray<OracleDelta>,
  intentional: ReadonlyArray<IntentionalOracleDelta>
): OracleDeltaReport => {
  const classification = classifyOracleDeltas(deltas, intentional)
  const bySurface: Record<string, number> = {}
  for (const delta of deltas) {
    const surface = pointerSurface(delta.path)
    bySurface[surface] = (bySurface[surface] ?? 0) + 1
  }
  return { ...classification, bySurface, total: deltas.length }
}

export const formatOracleDelta = (delta: OracleDelta | IntentionalOracleDelta): string => {
  switch (delta._tag) {
    case "Added":
      return `${delta.path || "/"}: added ${JSON.stringify(delta.after)}`
    case "Removed":
      return `${delta.path || "/"}: removed ${JSON.stringify(delta.before)}`
    case "Changed":
      return `${delta.path || "/"}: ${JSON.stringify(delta.before)} -> ${JSON.stringify(delta.after)}`
  }
}
