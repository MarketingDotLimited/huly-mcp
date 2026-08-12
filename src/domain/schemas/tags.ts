import type { TagReference as HulyTagReference } from "@hcengineering/tags"
import { Schema } from "effect"

import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"

import { clearableText } from "./clearable.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  ColorCode,
  Count,
  DEFAULT_COLOR_INDEX,
  DEFAULT_LIMIT,
  DocId,
  hasAtLeastOneDefined,
  LimitParam,
  MAX_COLOR_INDEX,
  NonEmptyString,
  ObjectClassName,
  SpaceId,
  TagCategoryIdentifier,
  TagElementId,
  TagIdentifier,
  TagReferenceId,
  withAtLeastOneRequired
} from "./shared.js"

type HulyTagWeight = NonNullable<HulyTagReference["weight"]>
type ExactTypeMatch<Actual, Expected> = [Actual] extends [Expected]
  ? [Expected] extends [Actual]
    ? true
    : false
  : false
type AssertTrue<T extends true> = T

export const TAG_WEIGHT_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const satisfies ReadonlyArray<HulyTagWeight> // eslint-disable-line no-magic-numbers
type LocalTagWeight = (typeof TAG_WEIGHT_VALUES)[number]

export type TagWeightSdkParity = AssertTrue<ExactTypeMatch<LocalTagWeight, HulyTagWeight>>

export const TagWeight = Schema.Literals(TAG_WEIGHT_VALUES).annotate({
  title: "TagWeight",
  description:
    "Optional tag reference weight/knowledge level. Kept in exact type-level parity with @hcengineering/tags TagReference.weight."
})
export type TagWeight = Schema.Schema.Type<typeof TagWeight>

export const TagTargetClass = ObjectClassName.annotate({
  title: "TagTargetClass",
  description:
    "Huly class or mixin this tag definition applies to, for example 'tracker:class:Issue' or 'recruit:mixin:Candidate'."
})
export type TagTargetClass = Schema.Schema.Type<typeof TagTargetClass>

export const TagObjectLocatorSchema = Schema.Struct({
  objectId: DocId.annotate({ description: "Raw Huly object ID that owns the tag reference." }),
  objectClass: ObjectClassName.annotate({
    description: "Raw Huly class/mixin of the object receiving the tag reference."
  }),
  space: SpaceId.annotate({ description: "Huly space ID where the tag reference should be stored." }),
  collection: NonEmptyString.annotate({
    description:
      "Collection field on the object that stores tag references, for example 'labels' for tracker issues or 'skills' for recruiting candidates."
  })
}).annotate({
  title: "TagObjectLocator",
  description:
    "Raw SDK object locator for tag references. Use module-specific wrapper tools when available; this locator is for SDK parity."
})
export type TagObjectLocator = Schema.Schema.Type<typeof TagObjectLocatorSchema>

export const TagSummarySchema = Schema.Struct({
  id: TagElementId,
  title: NonEmptyString,
  targetClass: TagTargetClass,
  description: Schema.String,
  color: ColorCode,
  category: NonEmptyString,
  refCount: Schema.optional(Count)
}).annotate({ title: "TagSummary", description: "Generic Huly tag definition summary." })
export type TagSummary = Schema.Schema.Type<typeof TagSummarySchema>

export const AttachedTagSummarySchema = Schema.Struct({
  id: TagReferenceId,
  tag: TagElementId,
  title: NonEmptyString,
  color: ColorCode,
  weight: Schema.optional(TagWeight)
}).annotate({ title: "AttachedTagSummary", description: "Generic Huly tag reference attached to one object." })
export type AttachedTagSummary = Schema.Schema.Type<typeof AttachedTagSummarySchema>

export const ListTagsParamsSchema = Schema.Struct({
  targetClass: TagTargetClass,
  category: Schema.optional(
    TagCategoryIdentifier.annotate({ description: "Filter by tag category ID or label within the targetClass." })
  ),
  titleSearch: Schema.optional(
    Schema.String.annotate({
      description: "Search tag titles by substring (case-insensitive where supported by Huly backend)."
    })
  ),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of tags to return (default: ${DEFAULT_LIMIT}).` })
  )
}).annotate({ title: "ListTagsParams", description: "List generic Huly tag definitions for one target class." })
export type ListTagsParams = Schema.Schema.Type<typeof ListTagsParamsSchema>

export const CreateTagParamsSchema = Schema.Struct({
  targetClass: TagTargetClass,
  title: NonEmptyString.annotate({ description: "Tag title." }),
  color: Schema.optional(
    ColorCode.annotate({
      description: `Huly platform color palette index from 0 through ${MAX_COLOR_INDEX} (default: ${DEFAULT_COLOR_INDEX}).`
    })
  ),
  description: Schema.optional(Schema.String.annotate({ description: "Tag description." })),
  category: Schema.optional(
    TagCategoryIdentifier.annotate({
      description:
        "Category ID or label within targetClass. If omitted, uses that targetClass default category when available, otherwise Huly's generic no-category bucket."
    })
  )
}).annotate({
  title: "CreateTagParams",
  description: "Create a generic Huly tag definition. Idempotent by targetClass + title."
})
export type CreateTagParams = Schema.Schema.Type<typeof CreateTagParamsSchema>

const updateTagFields = {
  title: Schema.optional(NonEmptyString.annotate({ description: "New tag title." })),
  color: Schema.optional(
    ColorCode.annotate({ description: `New Huly platform color palette index from 0 through ${MAX_COLOR_INDEX}.` })
  ),
  description: Schema.optional(clearableText("New tag description.")),
  category: Schema.optional(
    TagCategoryIdentifier.annotate({ description: "New category ID or label within targetClass." })
  )
}

export type UpdateTagField = keyof typeof updateTagFields
const UpdateTagFieldSchema = Schema.Struct(updateTagFields)
export const UPDATE_TAG_FIELDS = [
  "title",
  "color",
  "description",
  "category"
] as const satisfies ReadonlyArray<UpdateTagField>

export const UpdateTagParamsSchema = Schema.Struct({
  targetClass: TagTargetClass,
  tag: TagIdentifier.annotate({ description: "Tag ID or exact title. Title lookup is scoped to targetClass." }),
  ...UpdateTagFieldSchema.fields
})
  .check(
    Schema.makeFilter((params) =>
      hasAtLeastOneDefined(params, UPDATE_TAG_FIELDS) ? undefined : atLeastOneUpdateFieldMessage(UPDATE_TAG_FIELDS)
    )
  )
  .annotate({
    title: "UpdateTagParams",
    description: `Update a generic Huly tag definition. ${atLeastOneUpdateFieldMessage(UPDATE_TAG_FIELDS)}`
  })
export type UpdateTagParams = Schema.Schema.Type<typeof UpdateTagParamsSchema>
assertUpdateFields<UpdateTagParams>()(["targetClass", "tag"], UPDATE_TAG_FIELDS)

export const DeleteTagParamsSchema = Schema.Struct({
  targetClass: TagTargetClass,
  tag: TagIdentifier.annotate({ description: "Tag ID or exact title. Title lookup is scoped to targetClass." })
}).annotate({ title: "DeleteTagParams", description: "Delete a generic Huly tag definition." })
export type DeleteTagParams = Schema.Schema.Type<typeof DeleteTagParamsSchema>

export const ListAttachedTagsParamsSchema = TagObjectLocatorSchema.annotate({
  title: "ListAttachedTagsParams",
  description: "List generic tag references attached to one raw Huly object."
})
export type ListAttachedTagsParams = Schema.Schema.Type<typeof ListAttachedTagsParamsSchema>

export const AttachTagParamsSchema = Schema.Struct({
  targetClass: TagTargetClass,
  tag: TagIdentifier.annotate({
    description:
      "Tag ID or exact title within targetClass. If the title does not exist, attach_tag creates the tag definition first."
  }),
  object: TagObjectLocatorSchema,
  color: Schema.optional(
    ColorCode.annotate({
      description: `Huly platform color palette index from 0 through ${MAX_COLOR_INDEX} for a newly created tag definition (default: ${DEFAULT_COLOR_INDEX}). Ignored when the tag already exists.`
    })
  ),
  category: Schema.optional(
    TagCategoryIdentifier.annotate({
      description: "Category for a newly created tag definition. Ignored when the tag already exists."
    })
  ),
  weight: Schema.optional(
    TagWeight.annotate({ description: "Optional weight/knowledge level to store on the TagReference." })
  )
}).annotate({
  title: "AttachTagParams",
  description:
    "Attach a generic Huly tag to a raw object collection. Idempotent for the same object, collection, and tag."
})
export type AttachTagParams = Schema.Schema.Type<typeof AttachTagParamsSchema>

export const DetachTagParamsSchema = Schema.Struct({
  targetClass: TagTargetClass,
  tag: TagIdentifier.annotate({ description: "Tag ID or exact title within targetClass." }),
  object: TagObjectLocatorSchema
}).annotate({
  title: "DetachTagParams",
  description: "Detach a generic Huly tag from a raw object collection. Idempotent when the tag is not attached."
})
export type DetachTagParams = Schema.Schema.Type<typeof DetachTagParamsSchema>

export const CreateTagResultSchema = Schema.Struct({
  id: TagElementId,
  title: NonEmptyString,
  targetClass: TagTargetClass,
  created: Schema.Boolean
}).annotate({ title: "CreateTagResult", description: "Result of creating a generic Huly tag definition." })
export type CreateTagResult = Schema.Schema.Type<typeof CreateTagResultSchema>

export const UpdateTagResultSchema = Schema.Struct({ id: TagElementId, updated: Schema.Boolean }).annotate({
  title: "UpdateTagResult",
  description: "Result of updating a generic Huly tag definition."
})
export type UpdateTagResult = Schema.Schema.Type<typeof UpdateTagResultSchema>

export const DeleteTagResultSchema = Schema.Struct({ id: TagElementId, deleted: Schema.Boolean }).annotate({
  title: "DeleteTagResult",
  description: "Result of deleting a generic Huly tag definition."
})
export type DeleteTagResult = Schema.Schema.Type<typeof DeleteTagResultSchema>

export const AttachTagResultSchema = Schema.Struct({
  id: TagReferenceId,
  tag: TagElementId,
  title: NonEmptyString,
  attached: Schema.Boolean
}).annotate({ title: "AttachTagResult", description: "Result of attaching a tag reference." })
export type AttachTagResult = Schema.Schema.Type<typeof AttachTagResultSchema>

export const DetachTagResultSchema = Schema.Struct({ detached: Schema.Boolean, detachedCount: Count }).annotate({
  title: "DetachTagResult",
  description: "Result of detaching tag references."
})
export type DetachTagResult = Schema.Schema.Type<typeof DetachTagResultSchema>

const tagTargetClassDescription =
  "Huly class or mixin this tag definition applies to, such as tracker:class:Issue or recruit:mixin:Candidate."
const tagObjectLocatorDescriptions = {
  objectId: "Raw Huly object ID that owns the tag reference.",
  objectClass: "Raw Huly class or mixin of the object receiving the tag reference.",
  space: "Huly space ID where the tag reference is stored.",
  collection: "Collection field on the object that stores tag references."
} as const

export const listTagsParamsJsonSchema = withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(ListTagsParamsSchema), {
  targetClass: tagTargetClassDescription,
  category: "Filter by tag category ID or label within targetClass.",
  titleSearch: "Case-insensitive tag-title substring search.",
  limit: `Maximum number of tags to return (default: ${DEFAULT_LIMIT}).`
})
export const createTagParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(CreateTagParamsSchema),
  {
    targetClass: tagTargetClassDescription,
    title: "Tag title.",
    color: `Huly color palette index from 0 through ${MAX_COLOR_INDEX} (default: ${DEFAULT_COLOR_INDEX}).`,
    description: "Tag description.",
    category: "Category ID or label within targetClass; omitting it uses the default or no-category bucket."
  }
)
export const updateTagParamsJsonSchema = withAtLeastOneRequired(
  withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(UpdateTagParamsSchema), {
    targetClass: tagTargetClassDescription,
    tag: "Tag ID or exact title scoped to targetClass.",
    title: "New tag title.",
    color: `New Huly color palette index from 0 through ${MAX_COLOR_INDEX}.`,
    description: "New tag description; null clears it.",
    category: "New category ID or label within targetClass."
  }),
  UPDATE_TAG_FIELDS
)
export const deleteTagParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(DeleteTagParamsSchema),
  { targetClass: tagTargetClassDescription, tag: "Tag ID or exact title scoped to targetClass." }
)
export const listAttachedTagsParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(ListAttachedTagsParamsSchema),
  tagObjectLocatorDescriptions
)
export const attachTagParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(AttachTagParamsSchema),
  {
    targetClass: tagTargetClassDescription,
    tag: "Tag ID or exact title; a missing title creates the tag definition before attaching it.",
    object: "Raw Huly object and collection that will own the tag reference.",
    color: `Color palette index for a newly created tag (default: ${DEFAULT_COLOR_INDEX}); ignored for existing tags.`,
    category: "Category for a newly created tag; ignored for existing tags.",
    weight: "Optional weight or knowledge level stored on the tag reference."
  }
)
export const detachTagParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(DetachTagParamsSchema),
  {
    targetClass: tagTargetClassDescription,
    tag: "Tag ID or exact title within targetClass.",
    object: "Raw Huly object and collection from which to detach the tag reference."
  }
)

export const parseListTagsParams = Schema.decodeUnknownEffect(ListTagsParamsSchema)
export const parseCreateTagParams = Schema.decodeUnknownEffect(CreateTagParamsSchema)
export const parseUpdateTagParams = Schema.decodeUnknownEffect(UpdateTagParamsSchema)
export const parseDeleteTagParams = Schema.decodeUnknownEffect(DeleteTagParamsSchema)
export const parseListAttachedTagsParams = Schema.decodeUnknownEffect(ListAttachedTagsParamsSchema)
export const parseAttachTagParams = Schema.decodeUnknownEffect(AttachTagParamsSchema)
export const parseDetachTagParams = Schema.decodeUnknownEffect(DetachTagParamsSchema)

export const ListTagsResultSchema = Schema.Array(TagSummarySchema)
export const ListAttachedTagsResultSchema = Schema.Array(AttachedTagSummarySchema)
