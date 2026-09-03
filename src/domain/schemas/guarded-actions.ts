import { Schema } from "effect"

import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import { LimitParam, NonEmptyString, ObjectClassName } from "./shared.js"

const JsonObject = Schema.Record(Schema.String, Schema.Json)

export const FindHulyDocumentsParamsSchema = Schema.Struct({
  class: ObjectClassName,
  query: Schema.optional(JsonObject),
  projection: Schema.optional(Schema.Array(NonEmptyString)),
  limit: Schema.optional(LimitParam)
})

const CreateActionSchema = Schema.Struct({
  kind: Schema.Literal("create"),
  class: ObjectClassName,
  space: NonEmptyString,
  data: JsonObject
})
const UpdateActionSchema = Schema.Struct({
  kind: Schema.Literal("update"),
  class: ObjectClassName,
  objectId: NonEmptyString,
  operations: JsonObject,
  expectedModifiedOn: Schema.optional(Schema.Number)
})
const ApplyMixinActionSchema = Schema.Struct({
  kind: Schema.Literal("apply_mixin"),
  objectClass: ObjectClassName,
  objectId: NonEmptyString,
  mixin: ObjectClassName,
  data: JsonObject,
  expectedModifiedOn: Schema.optional(Schema.Number)
})
const RemoveActionSchema = Schema.Struct({
  kind: Schema.Literal("remove"),
  class: ObjectClassName,
  objectId: NonEmptyString,
  expectedModifiedOn: Schema.optional(Schema.Number)
})

export const GuardedHulyActionSchema = Schema.Union([
  CreateActionSchema,
  UpdateActionSchema,
  ApplyMixinActionSchema,
  RemoveActionSchema
])
export type GuardedHulyAction = Schema.Schema.Type<typeof GuardedHulyActionSchema>

export const PrepareHulyActionParamsSchema = Schema.Struct({ action: GuardedHulyActionSchema })
export const ExecuteHulyActionParamsSchema = Schema.Struct({ approvalToken: NonEmptyString })
export type FindHulyDocumentsParams = Schema.Schema.Type<typeof FindHulyDocumentsParamsSchema>
export type PrepareHulyActionParams = Schema.Schema.Type<typeof PrepareHulyActionParamsSchema>
export type ExecuteHulyActionParams = Schema.Schema.Type<typeof ExecuteHulyActionParamsSchema>

export const FindHulyDocumentsResultSchema = Schema.Struct({
  documents: Schema.Array(JsonObject),
  returned: Schema.Number
})
export const PrepareHulyActionResultSchema = Schema.Struct({
  approvalToken: NonEmptyString,
  expiresAt: Schema.Number,
  action: GuardedHulyActionSchema,
  payloadHash: NonEmptyString,
  warning: NonEmptyString
})
export const ExecuteHulyActionResultSchema = Schema.Struct({
  kind: Schema.Literals(["create", "update", "apply_mixin", "remove"]),
  objectId: NonEmptyString,
  executed: Schema.Boolean,
  auditHash: NonEmptyString
})

const descriptions = {
  class:
    "Exact non-system Huly class ID discovered through get_huly_class or list_huly_classes. System and private namespaces (e.g. core:class:Space) are rejected.",
  query: "Bounded Huly document query using JSON-compatible values.",
  projection: "Optional field names to return; system identity fields remain included.",
  limit: "Maximum documents to return.",
  action: "Exact business-document mutation to validate and preview.",
  approvalToken: "Opaque, single-use approval token returned by prepare_huly_action; expires after five minutes."
} as const

export const findHulyDocumentsParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(FindHulyDocumentsParamsSchema),
  descriptions
)
export const prepareHulyActionParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(PrepareHulyActionParamsSchema),
  descriptions
)
export const executeHulyActionParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(ExecuteHulyActionParamsSchema),
  descriptions
)

export const parseFindHulyDocumentsParams = Schema.decodeUnknownEffect(FindHulyDocumentsParamsSchema)
export const parsePrepareHulyActionParams = Schema.decodeUnknownEffect(PrepareHulyActionParamsSchema)
export const parseExecuteHulyActionParams = Schema.decodeUnknownEffect(ExecuteHulyActionParamsSchema)
