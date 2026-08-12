import { Schema } from "effect"

import { clearableText } from "./clearable.js"
import { toDraft07JsonSchema } from "./json-schema.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  ColorCode,
  DEFAULT_COLOR_INDEX,
  DEFAULT_LIMIT,
  hasAtLeastOneDefined,
  LimitParam,
  MAX_COLOR_INDEX,
  NonEmptyString,
  TagCategoryIdentifier,
  TagElementId,
  TagIdentifier,
  withAtLeastOneRequired
} from "./shared.js"

export const TagElementSummarySchema = Schema.Struct({
  id: TagElementId,
  title: NonEmptyString,
  color: ColorCode,
  category: NonEmptyString
}).annotate({ title: "TagElementSummary", description: "Label/tag summary for list operations" })

export type TagElementSummary = Schema.Schema.Type<typeof TagElementSummarySchema>

export const ListLabelsParamsSchema = Schema.Struct({
  category: Schema.optional(TagCategoryIdentifier.annotate({ description: "Filter by category ID or label name" })),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of labels to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({ title: "ListLabelsParams", description: "Parameters for listing label definitions" })

export type ListLabelsParams = Schema.Schema.Type<typeof ListLabelsParamsSchema>

export const CreateLabelParamsSchema = Schema.Struct({
  title: NonEmptyString.annotate({ description: "Label name" }),
  color: Schema.optional(
    ColorCode.annotate({
      description: `Huly platform color palette index from 0 through ${MAX_COLOR_INDEX} (default: ${DEFAULT_COLOR_INDEX})`
    })
  ),
  description: Schema.optional(Schema.String.annotate({ description: "Label description" })),
  category: Schema.optional(
    TagCategoryIdentifier.annotate({
      description: "Category ID or label name. Falls back to tracker default category ('Other') if not specified."
    })
  )
}).annotate({ title: "CreateLabelParams", description: "Parameters for creating a label definition" })

export type CreateLabelParams = Schema.Schema.Type<typeof CreateLabelParamsSchema>

export const UPDATE_LABEL_FIELDS = ["title", "color", "description"] as const satisfies ReadonlyArray<
  "title" | "color" | "description"
>

export const UpdateLabelParamsSchema = Schema.Struct({
  label: TagIdentifier.annotate({ description: "Label ID or title to update" }),
  title: Schema.optional(NonEmptyString.annotate({ description: "New label name" })),
  color: Schema.optional(
    ColorCode.annotate({ description: `New Huly platform color palette index from 0 through ${MAX_COLOR_INDEX}` })
  ),
  description: Schema.optional(clearableText("New label description."))
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_LABEL_FIELDS)
          ? undefined
          : atLeastOneUpdateFieldMessage(UPDATE_LABEL_FIELDS)
      )
    )
  )
  .annotate({
    title: "UpdateLabelParams",
    description: `Parameters for updating a label definition. ${atLeastOneUpdateFieldMessage(UPDATE_LABEL_FIELDS)}`
  })

export type UpdateLabelParams = Schema.Schema.Type<typeof UpdateLabelParamsSchema>
assertUpdateFields<UpdateLabelParams>()(["label"], UPDATE_LABEL_FIELDS)

export const DeleteLabelParamsSchema = Schema.Struct({
  label: TagIdentifier.annotate({ description: "Label ID or title to delete" })
}).annotate({ title: "DeleteLabelParams", description: "Parameters for deleting a label definition" })

export type DeleteLabelParams = Schema.Schema.Type<typeof DeleteLabelParamsSchema>

export const listLabelsParamsJsonSchema = toDraft07JsonSchema(ListLabelsParamsSchema)
export const createLabelParamsJsonSchema = toDraft07JsonSchema(CreateLabelParamsSchema)
export const updateLabelParamsJsonSchema = withAtLeastOneRequired(
  toDraft07JsonSchema(UpdateLabelParamsSchema),
  UPDATE_LABEL_FIELDS
)
export const deleteLabelParamsJsonSchema = toDraft07JsonSchema(DeleteLabelParamsSchema)

export const parseListLabelsParams = Schema.decodeUnknownEffect(ListLabelsParamsSchema)
export const parseCreateLabelParams = Schema.decodeUnknownEffect(CreateLabelParamsSchema)
export const parseUpdateLabelParams = Schema.decodeUnknownEffect(UpdateLabelParamsSchema)
export const parseDeleteLabelParams = Schema.decodeUnknownEffect(DeleteLabelParamsSchema)
export const CreateLabelResultSchema = Schema.Struct({
  id: TagElementId,
  title: Schema.String,
  created: Schema.Boolean
})
export type CreateLabelResult = Schema.Schema.Type<typeof CreateLabelResultSchema>
export const UpdateLabelResultSchema = Schema.Struct({ id: TagElementId, updated: Schema.Boolean })
export type UpdateLabelResult = Schema.Schema.Type<typeof UpdateLabelResultSchema>
export const DeleteLabelResultSchema = Schema.Struct({ id: TagElementId, deleted: Schema.Boolean })
export type DeleteLabelResult = Schema.Schema.Type<typeof DeleteLabelResultSchema>

export const ListLabelsResultSchema = Schema.Array(TagElementSummarySchema)
