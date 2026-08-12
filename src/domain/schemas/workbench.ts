import { Schema } from "effect"

import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"

import {
  Count,
  DEFAULT_LIMIT,
  DocId,
  hasMutuallyExclusiveFields,
  LimitParam,
  mutuallyExclusiveFieldsMessage,
  NonEmptyString,
  ObjectClassName,
  withMutuallyExclusiveFields
} from "./shared.js"

export const WorkbenchApplicationId = DocId.pipe(Schema.brand("WorkbenchApplicationId"))
export type WorkbenchApplicationId = Schema.Schema.Type<typeof WorkbenchApplicationId>
export const WorkbenchApplicationAlias = NonEmptyString.pipe(Schema.brand("WorkbenchApplicationAlias"))
export type WorkbenchApplicationAlias = Schema.Schema.Type<typeof WorkbenchApplicationAlias>
export const WorkbenchApplicationAliasSearch = NonEmptyString.pipe(Schema.brand("WorkbenchApplicationAliasSearch"))
export type WorkbenchApplicationAliasSearch = Schema.Schema.Type<typeof WorkbenchApplicationAliasSearch>
export const WorkbenchLabelId = NonEmptyString.pipe(Schema.brand("WorkbenchLabelId"))
export type WorkbenchLabelId = Schema.Schema.Type<typeof WorkbenchLabelId>
export const WorkbenchNavigationItemId = NonEmptyString.pipe(Schema.brand("WorkbenchNavigationItemId"))
export type WorkbenchNavigationItemId = Schema.Schema.Type<typeof WorkbenchNavigationItemId>
export const WorkbenchNavigationPosition = NonEmptyString.pipe(Schema.brand("WorkbenchNavigationPosition"))
export type WorkbenchNavigationPosition = Schema.Schema.Type<typeof WorkbenchNavigationPosition>
export const WorkbenchApplicationType = Schema.String.pipe(Schema.brand("WorkbenchApplicationType"))
export type WorkbenchApplicationType = Schema.Schema.Type<typeof WorkbenchApplicationType>
export const WorkbenchApplicationOrder = Schema.Int.pipe(Schema.brand("WorkbenchApplicationOrder"))
export type WorkbenchApplicationOrder = Schema.Schema.Type<typeof WorkbenchApplicationOrder>

export const WorkbenchAccountRoleSchema = Schema.Literals([
  "READONLYGUEST",
  "DocGuest",
  "GUEST",
  "USER",
  "MAINTAINER",
  "OWNER",
  "ADMIN"
])
export type WorkbenchAccountRole = Schema.Schema.Type<typeof WorkbenchAccountRoleSchema>

export const WorkbenchApplicationPositionSchema = Schema.Literals(["top", "mid", "bottom"])
export type WorkbenchApplicationPosition = Schema.Schema.Type<typeof WorkbenchApplicationPositionSchema>

const aliasFiltersAreExclusive = (params: { readonly alias?: unknown; readonly aliasSearch?: unknown }) =>
  !hasMutuallyExclusiveFields(params, ["alias", "aliasSearch"]) ||
  mutuallyExclusiveFieldsMessage(["alias", "aliasSearch"])

export const ListWorkbenchApplicationsParamsSchema = Schema.Struct({
  alias: Schema.optional(
    WorkbenchApplicationAlias.annotate({
      description: "Exact application URL alias. Duplicate exact aliases are rejected as ambiguous."
    })
  ),
  aliasSearch: Schema.optional(
    WorkbenchApplicationAliasSearch.annotate({
      description: "Case-insensitive application alias substring. Mutually exclusive with alias."
    })
  ),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum applications to return (default: ${DEFAULT_LIMIT}).` })
  )
})
  .check(Schema.makeFilter(aliasFiltersAreExclusive))
  .annotate({
    title: "ListWorkbenchApplicationsParams",
    description: "Optional alias filters for read-only Workbench application model discovery."
  })
export type ListWorkbenchApplicationsParams = Schema.Schema.Type<typeof ListWorkbenchApplicationsParamsSchema>

export const WorkbenchSpaceNavigationSchema = Schema.Struct({
  id: WorkbenchNavigationItemId,
  labelId: Schema.optionalKey(WorkbenchLabelId),
  spaceClass: ObjectClassName
})
export type WorkbenchSpaceNavigation = Schema.Schema.Type<typeof WorkbenchSpaceNavigationSchema>

export const WorkbenchSpecialNavigationSchema = Schema.Struct({
  id: WorkbenchNavigationItemId,
  labelId: WorkbenchLabelId,
  position: Schema.optionalKey(WorkbenchNavigationPosition),
  accessLevel: Schema.optionalKey(WorkbenchAccountRoleSchema),
  spaceClass: Schema.optionalKey(ObjectClassName)
})
export type WorkbenchSpecialNavigation = Schema.Schema.Type<typeof WorkbenchSpecialNavigationSchema>

export const WorkbenchGroupNavigationSchema = Schema.Struct({
  id: WorkbenchNavigationItemId,
  labelId: Schema.optionalKey(WorkbenchLabelId),
  groupByClass: ObjectClassName
})
export type WorkbenchGroupNavigation = Schema.Schema.Type<typeof WorkbenchGroupNavigationSchema>

export const WorkbenchNavigationSummarySchema = Schema.Struct({
  spaces: Schema.Array(WorkbenchSpaceNavigationSchema),
  specials: Schema.Array(WorkbenchSpecialNavigationSchema),
  groups: Schema.Array(WorkbenchGroupNavigationSchema)
})
export type WorkbenchNavigationSummary = Schema.Schema.Type<typeof WorkbenchNavigationSummarySchema>

export const WorkbenchApplicationSummarySchema = Schema.Struct({
  id: WorkbenchApplicationId,
  alias: WorkbenchApplicationAlias,
  labelId: WorkbenchLabelId.annotate({
    description: "Untranslated Huly IntlString resource ID; this is not fabricated display text."
  }),
  hidden: Schema.Boolean.annotate({ description: "Static model declaration flag." }),
  hiddenByPreference: Schema.Boolean.annotate({
    description: "Whether the authenticated account has a caller-owned HiddenApplication preference."
  }),
  accessLevel: Schema.optionalKey(WorkbenchAccountRoleSchema),
  position: Schema.optionalKey(WorkbenchApplicationPositionSchema),
  order: Schema.optionalKey(WorkbenchApplicationOrder),
  type: Schema.optionalKey(WorkbenchApplicationType),
  navigation: WorkbenchNavigationSummarySchema
})
export type WorkbenchApplicationSummary = Schema.Schema.Type<typeof WorkbenchApplicationSummarySchema>

export const ListWorkbenchApplicationsResultSchema = Schema.Struct({
  applications: Schema.Array(WorkbenchApplicationSummarySchema),
  total: Count
}).annotate({
  title: "ListWorkbenchApplicationsResult",
  description:
    "Workbench application and navigation model declarations. Presence does not prove plugin, provider, worker, API, role, or effective browser visibility."
})
export type ListWorkbenchApplicationsResult = Schema.Schema.Type<typeof ListWorkbenchApplicationsResultSchema>

export const listWorkbenchApplicationsParamsJsonSchema = withMutuallyExclusiveFields(
  withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(ListWorkbenchApplicationsParamsSchema), {
    alias: "Exact application URL alias. Duplicate exact aliases are rejected as ambiguous.",
    aliasSearch: "Case-insensitive application alias substring. Mutually exclusive with alias.",
    limit: `Maximum applications to return (default: ${DEFAULT_LIMIT}).`
  }),
  ["alias", "aliasSearch"]
)
export const parseListWorkbenchApplicationsParams = Schema.decodeUnknownEffect(ListWorkbenchApplicationsParamsSchema)
