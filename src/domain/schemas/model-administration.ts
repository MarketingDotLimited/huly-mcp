import { JSONSchema, Schema } from "effect"

import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  HulyAttributeIdentifier,
  HulyEnumId,
  NonEmptyString,
  withAtLeastOneRequired
} from "./shared.js"
import { HulyAttributeSummarySchema, HulyEnumSummarySchema } from "./sdk-discovery.js"

export const ModelIdentifier = NonEmptyString.pipe(Schema.brand("ModelIdentifier")).annotations({
  description: "Exact model document ID or exact case-insensitive model name/label."
})
export type ModelIdentifier = Schema.Schema.Type<typeof ModelIdentifier>

const ConfirmModelWrite = Schema.Literal(true).annotations({
  description: "Must be true to acknowledge that this operation changes Huly workspace model metadata."
})

const EnumValues = Schema.Array(NonEmptyString)
  .pipe(
    Schema.filter((values) =>
      new Set(values.map((value) => value.toLocaleLowerCase())).size === values.length
        ? undefined
        : "Enum values must be unique (case-insensitive)"
    )
  )
  .annotations({ description: "Ordered, case-insensitively unique enum option values." })

export const CreateHulyEnumParamsSchema = Schema.Struct({
  name: NonEmptyString,
  values: EnumValues,
  confirm: ConfirmModelWrite
}).annotations({ title: "CreateHulyEnumParams" })
export type CreateHulyEnumParams = Schema.Schema.Type<typeof CreateHulyEnumParamsSchema>

export const UPDATE_HULY_ENUM_FIELDS = ["name", "values"] as const
export const UpdateHulyEnumParamsSchema = Schema.Struct({
  enum: ModelIdentifier.annotations({ description: "Enum ID or exact enum name." }),
  name: Schema.optional(NonEmptyString),
  values: Schema.optional(EnumValues),
  confirm: ConfirmModelWrite
})
  .pipe(
    Schema.filter((params) =>
      UPDATE_HULY_ENUM_FIELDS.some((field) => params[field] !== undefined)
        ? undefined
        : atLeastOneUpdateFieldMessage(UPDATE_HULY_ENUM_FIELDS)
    )
  )
  .annotations({ title: "UpdateHulyEnumParams" })
export type UpdateHulyEnumParams = Schema.Schema.Type<typeof UpdateHulyEnumParamsSchema>
assertUpdateFields<UpdateHulyEnumParams>()(["enum", "confirm"], UPDATE_HULY_ENUM_FIELDS)

export const DeleteHulyEnumParamsSchema = Schema.Struct({
  enum: ModelIdentifier.annotations({ description: "Enum ID or exact enum name." }),
  confirm: ConfirmModelWrite
}).annotations({ title: "DeleteHulyEnumParams" })
export type DeleteHulyEnumParams = Schema.Schema.Type<typeof DeleteHulyEnumParamsSchema>

const ScalarAttributeTypeSchema = Schema.Struct({
  kind: Schema.Literal("string", "number", "boolean", "date", "markup")
})
const EnumAttributeTypeSchema = Schema.Struct({
  kind: Schema.Literal("enum"),
  enum: ModelIdentifier.annotations({ description: "Enum ID or exact enum name." })
})
const RefAttributeTypeSchema = Schema.Struct({
  kind: Schema.Literal("ref"),
  class: ModelIdentifier.annotations({ description: "Target class ID or exact class name/label." })
})
export const HulyAttributeWriteTypeSchema = Schema.Union(
  ScalarAttributeTypeSchema,
  EnumAttributeTypeSchema,
  RefAttributeTypeSchema
)
export type HulyAttributeWriteType = Schema.Schema.Type<typeof HulyAttributeWriteTypeSchema>

export const HulyAttributeIndexSchema = Schema.Literal("fulltext", "indexed", "indexedDescending")
export type HulyAttributeIndex = Schema.Schema.Type<typeof HulyAttributeIndexSchema>

export const CreateHulyAttributeParamsSchema = Schema.Struct({
  class: ModelIdentifier.annotations({ description: "Owning class/mixin ID or exact class name/label." }),
  name: NonEmptyString.annotations({ description: "Stable property key used on Huly documents." }),
  label: NonEmptyString.annotations({ description: "Human-readable property label." }),
  type: HulyAttributeWriteTypeSchema,
  index: Schema.optional(HulyAttributeIndexSchema),
  automationOnly: Schema.optional(Schema.Boolean),
  hidden: Schema.optional(Schema.Boolean),
  confirm: ConfirmModelWrite
}).annotations({ title: "CreateHulyAttributeParams" })
export type CreateHulyAttributeParams = Schema.Schema.Type<typeof CreateHulyAttributeParamsSchema>

export const UPDATE_HULY_ATTRIBUTE_FIELDS = ["label", "index", "automationOnly", "hidden"] as const
export const UpdateHulyAttributeParamsSchema = Schema.Struct({
  attribute: HulyAttributeIdentifier.annotations({ description: "Attribute ID or exact attribute name." }),
  class: Schema.optional(
    ModelIdentifier.annotations({ description: "Owning class ID or exact name; use to disambiguate attribute names." })
  ),
  label: Schema.optional(NonEmptyString),
  index: Schema.optional(Schema.NullOr(HulyAttributeIndexSchema)),
  automationOnly: Schema.optional(Schema.Boolean),
  hidden: Schema.optional(Schema.Boolean),
  confirm: ConfirmModelWrite
})
  .pipe(
    Schema.filter((params) =>
      UPDATE_HULY_ATTRIBUTE_FIELDS.some((field) => params[field] !== undefined)
        ? undefined
        : atLeastOneUpdateFieldMessage(UPDATE_HULY_ATTRIBUTE_FIELDS)
    )
  )
  .annotations({ title: "UpdateHulyAttributeParams" })
export type UpdateHulyAttributeParams = Schema.Schema.Type<typeof UpdateHulyAttributeParamsSchema>
assertUpdateFields<UpdateHulyAttributeParams>()(["attribute", "class", "confirm"], UPDATE_HULY_ATTRIBUTE_FIELDS)

export const DeleteHulyAttributeParamsSchema = Schema.Struct({
  attribute: HulyAttributeIdentifier.annotations({ description: "Attribute ID or exact attribute name." }),
  class: Schema.optional(
    ModelIdentifier.annotations({ description: "Owning class ID or exact name; use to disambiguate attribute names." })
  ),
  confirm: ConfirmModelWrite
}).annotations({ title: "DeleteHulyAttributeParams" })
export type DeleteHulyAttributeParams = Schema.Schema.Type<typeof DeleteHulyAttributeParamsSchema>

export const CreateHulyEnumResultSchema = Schema.Struct({ enum: HulyEnumSummarySchema, created: Schema.Boolean })
export const UpdateHulyEnumResultSchema = Schema.Struct({ enum: HulyEnumSummarySchema, updated: Schema.Boolean })
export const DeleteHulyEnumResultSchema = Schema.Struct({ enumId: HulyEnumId, deleted: Schema.Boolean })
export const CreateHulyAttributeResultSchema = Schema.Struct({
  attribute: HulyAttributeSummarySchema,
  created: Schema.Boolean
})
export const UpdateHulyAttributeResultSchema = Schema.Struct({
  attribute: HulyAttributeSummarySchema,
  updated: Schema.Boolean
})
export const DeleteHulyAttributeResultSchema = Schema.Struct({
  attributeId: HulyAttributeSummarySchema.fields.attributeId,
  deleted: Schema.Boolean
})

export type CreateHulyEnumResult = Schema.Schema.Type<typeof CreateHulyEnumResultSchema>
export type UpdateHulyEnumResult = Schema.Schema.Type<typeof UpdateHulyEnumResultSchema>
export type DeleteHulyEnumResult = Schema.Schema.Type<typeof DeleteHulyEnumResultSchema>
export type CreateHulyAttributeResult = Schema.Schema.Type<typeof CreateHulyAttributeResultSchema>
export type UpdateHulyAttributeResult = Schema.Schema.Type<typeof UpdateHulyAttributeResultSchema>
export type DeleteHulyAttributeResult = Schema.Schema.Type<typeof DeleteHulyAttributeResultSchema>

export const createHulyEnumParamsJsonSchema = JSONSchema.make(CreateHulyEnumParamsSchema)
export const updateHulyEnumParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateHulyEnumParamsSchema),
  UPDATE_HULY_ENUM_FIELDS
)
export const deleteHulyEnumParamsJsonSchema = JSONSchema.make(DeleteHulyEnumParamsSchema)
export const createHulyAttributeParamsJsonSchema = JSONSchema.make(CreateHulyAttributeParamsSchema)
export const updateHulyAttributeParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateHulyAttributeParamsSchema),
  UPDATE_HULY_ATTRIBUTE_FIELDS
)
export const deleteHulyAttributeParamsJsonSchema = JSONSchema.make(DeleteHulyAttributeParamsSchema)

const strictParseOptions = { onExcessProperty: "error" } as const
export const parseCreateHulyEnumParams = Schema.decodeUnknown(CreateHulyEnumParamsSchema, strictParseOptions)
export const parseUpdateHulyEnumParams = Schema.decodeUnknown(UpdateHulyEnumParamsSchema, strictParseOptions)
export const parseDeleteHulyEnumParams = Schema.decodeUnknown(DeleteHulyEnumParamsSchema, strictParseOptions)
export const parseCreateHulyAttributeParams = Schema.decodeUnknown(CreateHulyAttributeParamsSchema, strictParseOptions)
export const parseUpdateHulyAttributeParams = Schema.decodeUnknown(UpdateHulyAttributeParamsSchema, strictParseOptions)
export const parseDeleteHulyAttributeParams = Schema.decodeUnknown(DeleteHulyAttributeParamsSchema, strictParseOptions)
