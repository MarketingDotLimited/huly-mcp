import { Schema } from "effect"

import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"

import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  DEFAULT_LIMIT,
  hasAtLeastOneDefined,
  LimitParam,
  NonEmptyString,
  TagCategoryId,
  TagCategoryIdentifier,
  withAtLeastOneRequired
} from "./shared.js"

export const DEFAULT_TAG_CATEGORY_TARGET_CLASS = "tracker:class:Issue"
export const DEFAULT_TAG_CATEGORY_FLAG = false

export const TagCategorySummarySchema = Schema.Struct({
  id: TagCategoryId,
  label: NonEmptyString,
  targetClass: NonEmptyString,
  default: Schema.Boolean,
  tags: Schema.Array(Schema.String)
}).annotate({ title: "TagCategorySummary", description: "Tag category summary for list operations" })

export type TagCategorySummary = Schema.Schema.Type<typeof TagCategorySummarySchema>

export const ListTagCategoriesParamsSchema = Schema.Struct({
  targetClass: Schema.optional(
    NonEmptyString.annotate({
      description: "Filter by target class (e.g. 'tracker:class:Issue'). Omit to include all classes."
    })
  ),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of categories to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({ title: "ListTagCategoriesParams", description: "Parameters for listing tag categories" })

export type ListTagCategoriesParams = Schema.Schema.Type<typeof ListTagCategoriesParamsSchema>

export const CreateTagCategoryParamsSchema = Schema.Struct({
  label: NonEmptyString.annotate({ description: "Category name" }),
  targetClass: Schema.optional(
    NonEmptyString.annotate({
      description: `Target class for this category (default: ${DEFAULT_TAG_CATEGORY_TARGET_CLASS})`
    })
  ),
  default: Schema.optional(
    Schema.Boolean.annotate({
      description: `Whether this is a default category (default: ${DEFAULT_TAG_CATEGORY_FLAG})`
    })
  )
}).annotate({ title: "CreateTagCategoryParams", description: "Parameters for creating a tag category" })

export type CreateTagCategoryParams = Schema.Schema.Type<typeof CreateTagCategoryParamsSchema>

export const UPDATE_TAG_CATEGORY_FIELDS = ["label", "default"] as const satisfies ReadonlyArray<"label" | "default">

export const UpdateTagCategoryParamsSchema = Schema.Struct({
  category: TagCategoryIdentifier.annotate({ description: "Category ID or label name to update" }),
  label: Schema.optional(NonEmptyString.annotate({ description: "New category name" })),
  default: Schema.optional(Schema.Boolean.annotate({ description: "New default flag" }))
})
  .check(
    Schema.makeFilter((params) =>
      hasAtLeastOneDefined(params, UPDATE_TAG_CATEGORY_FIELDS)
        ? undefined
        : atLeastOneUpdateFieldMessage(UPDATE_TAG_CATEGORY_FIELDS)
    )
  )
  .annotate({
    title: "UpdateTagCategoryParams",
    description: `Parameters for updating a tag category. ${atLeastOneUpdateFieldMessage(UPDATE_TAG_CATEGORY_FIELDS)}`
  })

export type UpdateTagCategoryParams = Schema.Schema.Type<typeof UpdateTagCategoryParamsSchema>
assertUpdateFields<UpdateTagCategoryParams>()(["category"], UPDATE_TAG_CATEGORY_FIELDS)

export const DeleteTagCategoryParamsSchema = Schema.Struct({
  category: TagCategoryIdentifier.annotate({ description: "Category ID or label name to delete" })
}).annotate({ title: "DeleteTagCategoryParams", description: "Parameters for deleting a tag category" })

export type DeleteTagCategoryParams = Schema.Schema.Type<typeof DeleteTagCategoryParamsSchema>

export const listTagCategoriesParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(ListTagCategoriesParamsSchema),
  {
    targetClass: "Filter by target class ID. Omit to include all classes.",
    limit: `Maximum number of categories to return (default: ${DEFAULT_LIMIT}).`
  }
)
export const createTagCategoryParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(CreateTagCategoryParamsSchema),
  {
    label: "Category name.",
    targetClass: `Target class for this category (default: ${DEFAULT_TAG_CATEGORY_TARGET_CLASS}).`,
    default: `Whether this is a default category (default: ${DEFAULT_TAG_CATEGORY_FLAG}).`
  }
)
export const updateTagCategoryParamsJsonSchema = withAtLeastOneRequired(
  withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(UpdateTagCategoryParamsSchema), {
    category: "Category ID or exact label to update.",
    label: "New category name.",
    default: "New default-category flag."
  }),
  UPDATE_TAG_CATEGORY_FIELDS
)
export const deleteTagCategoryParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(DeleteTagCategoryParamsSchema),
  { category: "Category ID or exact label to delete." }
)

export const parseListTagCategoriesParams = Schema.decodeUnknownEffect(ListTagCategoriesParamsSchema)
export const parseCreateTagCategoryParams = Schema.decodeUnknownEffect(CreateTagCategoryParamsSchema)
export const parseUpdateTagCategoryParams = Schema.decodeUnknownEffect(UpdateTagCategoryParamsSchema)
export const parseDeleteTagCategoryParams = Schema.decodeUnknownEffect(DeleteTagCategoryParamsSchema)
export const CreateTagCategoryResultSchema = Schema.Struct({
  id: TagCategoryId,
  label: Schema.String,
  created: Schema.Boolean
})
export type CreateTagCategoryResult = Schema.Schema.Type<typeof CreateTagCategoryResultSchema>
export const UpdateTagCategoryResultSchema = Schema.Struct({ id: TagCategoryId, updated: Schema.Boolean })
export type UpdateTagCategoryResult = Schema.Schema.Type<typeof UpdateTagCategoryResultSchema>
export const DeleteTagCategoryResultSchema = Schema.Struct({ id: TagCategoryId, deleted: Schema.Boolean })
export type DeleteTagCategoryResult = Schema.Schema.Type<typeof DeleteTagCategoryResultSchema>

export const ListTagCategoriesResultSchema = Schema.Array(TagCategorySummarySchema)
