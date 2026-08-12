import { Schema } from "effect"

import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"

import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  HulyAttributeIdentifier,
  HulyEnumId,
  NonEmptyString,
  withAtLeastOneRequired
} from "./shared.js"
import { HulyAttributeSummarySchema, HulyEnumSummarySchema } from "./sdk-discovery.js"

export const ModelIdentifier = NonEmptyString.pipe(Schema.brand("ModelIdentifier")).annotate({
  description: "Exact model document ID or exact case-insensitive model name/label."
})
export type ModelIdentifier = Schema.Schema.Type<typeof ModelIdentifier>

const ConfirmModelWrite = Schema.Literal(true).annotate({
  description: "Must be true to acknowledge that this operation changes Huly workspace model metadata."
})

const EnumValues = Schema.Array(NonEmptyString)
  .check(
    Schema.makeFilter((values) =>
      new Set(values.map((value) => value.toLocaleLowerCase())).size === values.length
        ? undefined
        : "Enum values must be unique (case-insensitive)"
    )
  )
  .annotate({ description: "Ordered, case-insensitively unique enum option values." })

export const CreateHulyEnumParamsSchema = Schema.Struct({
  name: NonEmptyString,
  values: EnumValues,
  confirm: ConfirmModelWrite
}).annotate({ title: "CreateHulyEnumParams" })
export type CreateHulyEnumParams = Schema.Schema.Type<typeof CreateHulyEnumParamsSchema>

export const UPDATE_HULY_ENUM_FIELDS = ["name", "values"] as const
export const UpdateHulyEnumParamsSchema = Schema.Struct({
  enum: ModelIdentifier.annotate({ description: "Enum ID or exact enum name." }),
  name: Schema.optional(NonEmptyString),
  values: Schema.optional(EnumValues),
  confirm: ConfirmModelWrite
})
  .check(
    Schema.makeFilter((params) =>
      UPDATE_HULY_ENUM_FIELDS.some((field) => params[field] !== undefined)
        ? undefined
        : atLeastOneUpdateFieldMessage(UPDATE_HULY_ENUM_FIELDS)
    )
  )
  .annotate({ title: "UpdateHulyEnumParams" })
export type UpdateHulyEnumParams = Schema.Schema.Type<typeof UpdateHulyEnumParamsSchema>
assertUpdateFields<UpdateHulyEnumParams>()(["enum", "confirm"], UPDATE_HULY_ENUM_FIELDS)

export const DeleteHulyEnumParamsSchema = Schema.Struct({
  enum: ModelIdentifier.annotate({ description: "Enum ID or exact enum name." }),
  confirm: ConfirmModelWrite
}).annotate({ title: "DeleteHulyEnumParams" })
export type DeleteHulyEnumParams = Schema.Schema.Type<typeof DeleteHulyEnumParamsSchema>

const ScalarAttributeTypeSchema = Schema.Struct({
  kind: Schema.Literals(["string", "number", "boolean", "date", "markup"])
})
const EnumAttributeTypeSchema = Schema.Struct({
  kind: Schema.Literal("enum"),
  enum: ModelIdentifier.annotate({ description: "Enum ID or exact enum name." })
})
const RefAttributeTypeSchema = Schema.Struct({
  kind: Schema.Literal("ref"),
  class: ModelIdentifier.annotate({ description: "Target class ID or exact class name/label." })
})
export const HulyAttributeWriteTypeSchema = Schema.Union([
  ScalarAttributeTypeSchema,
  EnumAttributeTypeSchema,
  RefAttributeTypeSchema
])
export type HulyAttributeWriteType = Schema.Schema.Type<typeof HulyAttributeWriteTypeSchema>

export const HulyAttributeIndexSchema = Schema.Literals(["fulltext", "indexed", "indexedDescending"])
export type HulyAttributeIndex = Schema.Schema.Type<typeof HulyAttributeIndexSchema>

export const CreateHulyAttributeParamsSchema = Schema.Struct({
  class: ModelIdentifier.annotate({ description: "Owning class/mixin ID or exact class name/label." }),
  name: NonEmptyString.annotate({ description: "Stable property key used on Huly documents." }),
  label: NonEmptyString.annotate({ description: "Human-readable property label." }),
  type: HulyAttributeWriteTypeSchema,
  index: Schema.optional(HulyAttributeIndexSchema),
  automationOnly: Schema.optional(Schema.Boolean),
  hidden: Schema.optional(Schema.Boolean),
  confirm: ConfirmModelWrite
}).annotate({ title: "CreateHulyAttributeParams" })
export type CreateHulyAttributeParams = Schema.Schema.Type<typeof CreateHulyAttributeParamsSchema>

export const UPDATE_HULY_ATTRIBUTE_FIELDS = ["label", "index", "automationOnly", "hidden"] as const
export const UpdateHulyAttributeParamsSchema = Schema.Struct({
  attribute: HulyAttributeIdentifier.annotate({ description: "Attribute ID or exact attribute name." }),
  class: Schema.optional(
    ModelIdentifier.annotate({ description: "Owning class ID or exact name; use to disambiguate attribute names." })
  ),
  label: Schema.optional(NonEmptyString),
  index: Schema.optional(Schema.NullOr(HulyAttributeIndexSchema)),
  automationOnly: Schema.optional(Schema.Boolean),
  hidden: Schema.optional(Schema.Boolean),
  confirm: ConfirmModelWrite
})
  .check(
    Schema.makeFilter((params) =>
      UPDATE_HULY_ATTRIBUTE_FIELDS.some((field) => params[field] !== undefined)
        ? undefined
        : atLeastOneUpdateFieldMessage(UPDATE_HULY_ATTRIBUTE_FIELDS)
    )
  )
  .annotate({ title: "UpdateHulyAttributeParams" })
export type UpdateHulyAttributeParams = Schema.Schema.Type<typeof UpdateHulyAttributeParamsSchema>
assertUpdateFields<UpdateHulyAttributeParams>()(["attribute", "class", "confirm"], UPDATE_HULY_ATTRIBUTE_FIELDS)

export const DeleteHulyAttributeParamsSchema = Schema.Struct({
  attribute: HulyAttributeIdentifier.annotate({ description: "Attribute ID or exact attribute name." }),
  class: Schema.optional(
    ModelIdentifier.annotate({ description: "Owning class ID or exact name; use to disambiguate attribute names." })
  ),
  confirm: ConfirmModelWrite
}).annotate({ title: "DeleteHulyAttributeParams" })
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

const modelWriteConfirmationDescription =
  "Must be true to acknowledge that this operation changes Huly workspace model metadata."

export const createHulyEnumParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(CreateHulyEnumParamsSchema),
  {
    name: "Unique human-readable enum name.",
    values: "Ordered, case-insensitively unique enum option values.",
    confirm: modelWriteConfirmationDescription
  }
)
export const updateHulyEnumParamsJsonSchema = withAtLeastOneRequired(
  withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(UpdateHulyEnumParamsSchema), {
    enum: "Enum ID or exact enum name.",
    name: "New unique enum name.",
    values: "Replacement ordered, case-insensitively unique enum option values.",
    confirm: modelWriteConfirmationDescription
  }),
  UPDATE_HULY_ENUM_FIELDS
)
export const deleteHulyEnumParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(DeleteHulyEnumParamsSchema),
  { enum: "Enum ID or exact enum name.", confirm: modelWriteConfirmationDescription }
)
export const createHulyAttributeParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(CreateHulyAttributeParamsSchema),
  {
    class: "Owning class or mixin ID, exact name, or exact label.",
    name: "Stable property key used on Huly documents.",
    label: "Human-readable property label.",
    type: "Attribute type definition, including referenced enum or class when required.",
    index: "Optional Huly attribute index mode.",
    automationOnly: "Whether the attribute is restricted to automation-owned behavior.",
    hidden: "Whether the attribute is hidden from ordinary Huly UI surfaces.",
    confirm: modelWriteConfirmationDescription
  }
)
export const updateHulyAttributeParamsJsonSchema = withAtLeastOneRequired(
  withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(UpdateHulyAttributeParamsSchema), {
    attribute: "Attribute ID or exact attribute name.",
    class: "Owning class ID or exact name used to disambiguate attribute names.",
    label: "New human-readable property label.",
    index: "New index mode; null removes the current index.",
    automationOnly: "New automation-only flag.",
    hidden: "New hidden flag.",
    confirm: modelWriteConfirmationDescription
  }),
  UPDATE_HULY_ATTRIBUTE_FIELDS
)
export const deleteHulyAttributeParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(DeleteHulyAttributeParamsSchema),
  {
    attribute: "Attribute ID or exact attribute name.",
    class: "Owning class ID or exact name used to disambiguate attribute names.",
    confirm: modelWriteConfirmationDescription
  }
)

const strictParseOptions = { onExcessProperty: "error" } as const
export const parseCreateHulyEnumParams = Schema.decodeUnknownEffect(CreateHulyEnumParamsSchema, strictParseOptions)
export const parseUpdateHulyEnumParams = Schema.decodeUnknownEffect(UpdateHulyEnumParamsSchema, strictParseOptions)
export const parseDeleteHulyEnumParams = Schema.decodeUnknownEffect(DeleteHulyEnumParamsSchema, strictParseOptions)
export const parseCreateHulyAttributeParams = Schema.decodeUnknownEffect(
  CreateHulyAttributeParamsSchema,
  strictParseOptions
)
export const parseUpdateHulyAttributeParams = Schema.decodeUnknownEffect(
  UpdateHulyAttributeParamsSchema,
  strictParseOptions
)
export const parseDeleteHulyAttributeParams = Schema.decodeUnknownEffect(
  DeleteHulyAttributeParamsSchema,
  strictParseOptions
)
