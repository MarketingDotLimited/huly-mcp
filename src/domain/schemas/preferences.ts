import { Schema } from "effect"

import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"

import { optionalOutput } from "./output-helpers.js"
import {
  DEFAULT_LIMIT,
  DocId,
  LimitParam,
  ListTotal,
  ObjectClassName,
  SpaceClassFilter,
  SpaceId,
  SpaceIdentifier,
  SpaceTypeId
} from "./shared.js"
import { SpaceSummarySchema } from "./spaces.js"

export const SpacePreferenceId = DocId.pipe(Schema.brand("SpacePreferenceId"))
export type SpacePreferenceId = Schema.Schema.Type<typeof SpacePreferenceId>

const spaceResolverOptionsRequireSpace = "includeArchived, class, and type can only be provided when space is provided."

export const ListSpacePreferencesParamsSchema = Schema.Struct({
  space: Schema.optional(
    SpaceIdentifier.annotate({
      description:
        "Optional space _id or exact space name whose low-level SpacePreference record should be listed. Resolution tries _id first, then exact name."
    })
  ),
  includeArchived: Schema.optional(
    Schema.Boolean.annotate({
      description:
        "Allow matching archived spaces by exact name when space is provided. ID lookup can return archived spaces."
    })
  ),
  class: Schema.optional(
    SpaceClassFilter.annotate({
      description: "Optional raw Huly space class ID used to disambiguate exact-name lookup when space is provided."
    })
  ),
  type: Schema.optional(
    SpaceTypeId.annotate({
      description: "Optional raw Huly SpaceType _id used to disambiguate exact-name lookup when space is provided."
    })
  ),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of space preferences to return (default: ${DEFAULT_LIMIT}).` })
  )
})
  .check(
    Schema.makeFilter((params) =>
      params.space !== undefined ||
      (params.includeArchived === undefined && params.class === undefined && params.type === undefined)
        ? undefined
        : spaceResolverOptionsRequireSpace
    )
  )
  .annotate({
    title: "ListSpacePreferencesParams",
    description:
      "List low-level Huly SpacePreference records. These records are generic space-attached preference markers; module-specific preference payloads remain exposed through module-specific tools."
  })
export type ListSpacePreferencesParams = Schema.Schema.Type<typeof ListSpacePreferencesParamsSchema>

export const GetSpacePreferenceParamsSchema = Schema.Struct({
  space: SpaceIdentifier.annotate({
    description:
      "Space _id or exact space name whose low-level SpacePreference record should be read. Resolution tries _id first, then exact name."
  }),
  includeArchived: Schema.optional(
    Schema.Boolean.annotate({
      description: "Allow matching archived spaces by exact name. ID lookup can return archived spaces."
    })
  ),
  class: Schema.optional(
    SpaceClassFilter.annotate({
      description: "Optional raw Huly space class ID used to disambiguate exact-name lookup."
    })
  ),
  type: Schema.optional(
    SpaceTypeId.annotate({ description: "Optional raw Huly SpaceType _id used to disambiguate exact-name lookup." })
  )
}).annotate({
  title: "GetSpacePreferenceParams",
  description:
    "Read the low-level Huly SpacePreference record attached to one space. Absence is returned as present=false."
})
export type GetSpacePreferenceParams = Schema.Schema.Type<typeof GetSpacePreferenceParamsSchema>

export const SpacePreferenceSchema = Schema.Struct({
  preferenceId: SpacePreferenceId,
  attachedTo: SpaceId.annotate({ description: "Raw Huly space ID stored in SpacePreference.attachedTo." }),
  attachedSpace: optionalOutput(SpaceSummarySchema),
  class: ObjectClassName.annotate({ description: "Raw Huly class ID for the returned preference document." })
}).annotate({
  title: "SpacePreference",
  description:
    "Low-level Huly SpacePreference row attached to a space. The published SDK model exposes no safe generic writable preference fields beyond attachedTo."
})
export type SpacePreference = Schema.Schema.Type<typeof SpacePreferenceSchema>

export const ListSpacePreferencesResultSchema = Schema.Struct({
  preferences: Schema.Array(SpacePreferenceSchema),
  total: ListTotal
})
export type ListSpacePreferencesResult = Schema.Schema.Type<typeof ListSpacePreferencesResultSchema>

export const GetSpacePreferenceResultSchema = Schema.Union([
  Schema.Struct({ present: Schema.Literal(true), preference: SpacePreferenceSchema }),
  Schema.Struct({ present: Schema.Literal(false), attachedTo: SpaceId, attachedSpace: SpaceSummarySchema })
])
export type GetSpacePreferenceResult = Schema.Schema.Type<typeof GetSpacePreferenceResultSchema>

const spacePreferenceResolverDescriptions = {
  space: "Space ID or exact space name. Resolution tries ID first, then exact name.",
  includeArchived: "Allow exact-name matching against archived spaces. ID lookup may return archived spaces.",
  class: "Raw Huly space class ID used to disambiguate exact-name lookup.",
  type: "Raw Huly SpaceType ID used to disambiguate exact-name lookup."
} as const

export const listSpacePreferencesParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(ListSpacePreferencesParamsSchema),
  {
    ...spacePreferenceResolverDescriptions,
    limit: `Maximum number of preferences to return (default: ${DEFAULT_LIMIT}).`
  }
)
export const getSpacePreferenceParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(GetSpacePreferenceParamsSchema),
  spacePreferenceResolverDescriptions
)

export const parseListSpacePreferencesParams = Schema.decodeUnknownEffect(ListSpacePreferencesParamsSchema)
export const parseGetSpacePreferenceParams = Schema.decodeUnknownEffect(GetSpacePreferenceParamsSchema)
