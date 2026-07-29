import { JSONSchema, Schema } from "effect"

import { withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import { Count, DEFAULT_LIMIT, DocId, LimitParam, NonEmptyString, ObjectClassName, PersonId } from "./shared.js"

const SdkOpenPayload = Schema.Unknown.annotations({
  description: "Raw SDK-owned payload passed through without inventing a closed MCP-side schema."
})

export const FilteredViewId = DocId.pipe(Schema.brand("FilteredViewId"))
export type FilteredViewId = Schema.Schema.Type<typeof FilteredViewId>

export const ViewletId = DocId.pipe(Schema.brand("ViewletId"))
export type ViewletId = Schema.Schema.Type<typeof ViewletId>

export const ViewletDescriptorId = DocId.pipe(Schema.brand("ViewletDescriptorId"))
export type ViewletDescriptorId = Schema.Schema.Type<typeof ViewletDescriptorId>

export const ViewletPreferenceId = DocId.pipe(Schema.brand("ViewletPreferenceId"))
export type ViewletPreferenceId = Schema.Schema.Type<typeof ViewletPreferenceId>

export const FilteredViewIdentifier = NonEmptyString.pipe(Schema.brand("FilteredViewIdentifier")).annotations({
  identifier: "FilteredViewIdentifier",
  title: "FilteredViewIdentifier",
  description: "Saved filtered view locator: FilteredView _id or exact saved view name."
})
export type FilteredViewIdentifier = Schema.Schema.Type<typeof FilteredViewIdentifier>

export const ViewletIdentifier = NonEmptyString.pipe(Schema.brand("ViewletIdentifier")).annotations({
  identifier: "ViewletIdentifier",
  title: "ViewletIdentifier",
  description:
    "Viewlet locator: Viewlet _id, exact title, exact variant, or descriptor _id. Descriptor _id matches may return multiple viewlets; title and variant matches must be unique."
})
export type ViewletIdentifier = Schema.Schema.Type<typeof ViewletIdentifier>

export const FilteredViewVisibilitySchema = Schema.Literal("own", "shared", "all").annotations({
  title: "FilteredViewVisibility",
  description: "Filter saved filtered views by whether the current account is in the saved view users list."
})
export type FilteredViewVisibility = Schema.Schema.Type<typeof FilteredViewVisibilitySchema>

export const ListFilteredViewsParamsSchema = Schema.Struct({
  attachedTo: Schema.optional(
    NonEmptyString.annotations({
      description:
        "Optional raw Huly app/resource string to scope saved filtered views, for example board:app:Board. Omit to list saved views across modules."
    })
  ),
  visibility: Schema.optional(FilteredViewVisibilitySchema),
  nameSearch: Schema.optional(Schema.String.annotations({ description: "Optional saved view name substring search." })),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of saved filtered views to return (default: ${DEFAULT_LIMIT}).`
    })
  )
}).annotations({
  title: "ListFilteredViewsParams",
  description:
    "Read-only discovery for @hcengineering/view FilteredView documents. Use attachedTo when you know the owning app/resource string, for example board:app:Board, and want scoped results."
})
export type ListFilteredViewsParams = Schema.Schema.Type<typeof ListFilteredViewsParamsSchema>

export const GetFilteredViewParamsSchema = Schema.Struct({
  filteredView: FilteredViewIdentifier.annotations({ description: "FilteredView _id or exact saved view name." }),
  attachedTo: Schema.optional(
    NonEmptyString.annotations({
      description:
        "Optional raw Huly app/resource string to disambiguate exact-name matches, for example board:app:Board."
    })
  )
}).annotations({ title: "GetFilteredViewParams", description: "Read one saved filtered view by _id or exact name." })
export type GetFilteredViewParams = Schema.Schema.Type<typeof GetFilteredViewParamsSchema>

export const ListViewletsParamsSchema = Schema.Struct({
  attachTo: Schema.optional(
    ObjectClassName.annotations({
      description:
        "Optional Huly class id that the viewlet renders, for example board:class:Card. Use list_huly_classes when you need class ids."
    })
  ),
  viewlet: Schema.optional(
    ViewletIdentifier.annotations({
      description:
        "Optional Viewlet _id, exact title, exact variant, or descriptor _id. Descriptor _id matches may return multiple viewlets; omit to list all matching viewlets."
    })
  ),
  limit: Schema.optional(
    LimitParam.annotations({ description: `Maximum number of viewlets to return (default: ${DEFAULT_LIMIT}).` })
  )
}).annotations({
  title: "ListViewletsParams",
  description:
    "Read-only discovery for @hcengineering/view Viewlet model documents. Includes descriptor metadata and matching ViewletPreference config rows."
})
export type ListViewletsParams = Schema.Schema.Type<typeof ListViewletsParamsSchema>

export const FilteredViewSummarySchema = Schema.Struct({
  id: FilteredViewId,
  name: NonEmptyString,
  attachedTo: NonEmptyString,
  visibility: Schema.Literal("own", "shared"),
  sharable: Schema.optional(Schema.Boolean),
  users: Count,
  viewletId: Schema.optional(ViewletId)
})
export type FilteredViewSummary = Schema.Schema.Type<typeof FilteredViewSummarySchema>

export const FilteredViewDetailSchema = Schema.Struct({
  id: FilteredViewId,
  name: NonEmptyString,
  visibility: Schema.Literal("own", "shared"),
  attachedTo: NonEmptyString,
  location: SdkOpenPayload,
  filters: SdkOpenPayload,
  viewOptions: Schema.optional(SdkOpenPayload),
  filterClass: Schema.optional(ObjectClassName),
  viewletId: Schema.optional(ViewletId),
  sharable: Schema.optional(Schema.Boolean),
  users: Count,
  createdBy: PersonId
})
export type FilteredViewDetail = Schema.Schema.Type<typeof FilteredViewDetailSchema>

export const ListFilteredViewsResultSchema = Schema.Struct({
  filteredViews: Schema.Array(FilteredViewSummarySchema),
  total: Count
})
export type ListFilteredViewsResult = Schema.Schema.Type<typeof ListFilteredViewsResultSchema>

const ViewletDescriptorSummarySchema = Schema.Struct({
  id: ViewletDescriptorId,
  label: Schema.optional(NonEmptyString),
  icon: Schema.optional(Schema.String),
  color: Schema.optional(Schema.Number),
  hidden: Schema.optional(Schema.Boolean),
  readonly: Schema.optional(Schema.Boolean),
  component: Schema.optional(SdkOpenPayload)
})
export type ViewletDescriptorSummary = Schema.Schema.Type<typeof ViewletDescriptorSummarySchema>

const ViewletPreferenceConfigSchema = Schema.Struct({
  id: ViewletPreferenceId,
  attachedTo: ViewletId,
  config: Schema.Array(SdkOpenPayload)
})
export type ViewletPreferenceConfig = Schema.Schema.Type<typeof ViewletPreferenceConfigSchema>

export const ViewletSummarySchema = Schema.Struct({
  id: ViewletId,
  attachTo: ObjectClassName,
  descriptor: ViewletDescriptorId,
  title: Schema.optional(NonEmptyString),
  variant: Schema.optional(NonEmptyString),
  baseQuery: Schema.optional(SdkOpenPayload),
  options: Schema.optional(SdkOpenPayload),
  config: Schema.Array(SdkOpenPayload),
  configOptions: Schema.optional(SdkOpenPayload),
  viewOptions: Schema.optional(SdkOpenPayload),
  masterDetailOptions: Schema.optional(SdkOpenPayload),
  props: Schema.optional(SdkOpenPayload),
  descriptorInfo: Schema.optional(ViewletDescriptorSummarySchema),
  preferences: Schema.Array(ViewletPreferenceConfigSchema)
})
export type ViewletSummary = Schema.Schema.Type<typeof ViewletSummarySchema>

export const ListViewletsResultSchema = Schema.Struct({ viewlets: Schema.Array(ViewletSummarySchema), total: Count })
export type ListViewletsResult = Schema.Schema.Type<typeof ListViewletsResultSchema>

export const listFilteredViewsParamsJsonSchema = JSONSchema.make(ListFilteredViewsParamsSchema)
export const getFilteredViewParamsJsonSchema = {
  ...withJsonSchemaPropertyDescriptions(JSONSchema.make(GetFilteredViewParamsSchema), {
    filteredView: "FilteredView _id or exact saved view name.",
    attachedTo: "Optional raw Huly app/resource string such as board:app:Board to disambiguate exact-name matches."
  }),
  description: "Read one saved filtered view by _id or exact name."
}
export const listViewletsParamsJsonSchema = JSONSchema.make(ListViewletsParamsSchema)

export const parseListFilteredViewsParams = Schema.decodeUnknown(ListFilteredViewsParamsSchema)
export const parseGetFilteredViewParams = Schema.decodeUnknown(GetFilteredViewParamsSchema)
export const parseListViewletsParams = Schema.decodeUnknown(ListViewletsParamsSchema)
