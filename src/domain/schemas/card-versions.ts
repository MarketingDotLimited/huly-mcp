import { JSONSchema, Schema } from "effect"

import {
  CardId,
  CardIdentifier,
  CardSpaceIdentifier,
  Count,
  DEFAULT_LIMIT,
  LimitParam,
  NonEmptyString
} from "./shared.js"

export const CardVersionNumber = Schema.Number.pipe(
  Schema.int(),
  Schema.positive(),
  Schema.brand("CardVersionNumber")
).annotations({
  identifier: "CardVersionNumber",
  title: "CardVersionNumber",
  description: "Positive integer assigned by Huly's versioning middleware."
})
export type CardVersionNumber = Schema.Schema.Type<typeof CardVersionNumber>

export const CardVersionChainId = NonEmptyString.pipe(Schema.brand("CardVersionChainId")).annotations({
  identifier: "CardVersionChainId",
  title: "CardVersionChainId",
  description: "Huly baseId shared by every card in one version chain."
})
export type CardVersionChainId = Schema.Schema.Type<typeof CardVersionChainId>

export const CardVersionMetadataSchema = Schema.Struct({
  number: CardVersionNumber,
  chainId: CardVersionChainId,
  isLatest: Schema.optionalWith(Schema.Boolean, { exact: true }),
  readonly: Schema.optionalWith(Schema.Boolean, { exact: true })
})
export type CardVersionMetadata = Schema.Schema.Type<typeof CardVersionMetadataSchema>

export const CardVersionSummarySchema = Schema.Struct({
  id: CardId,
  title: Schema.String,
  version: Schema.optionalWith(CardVersionMetadataSchema, { exact: true }),
  modifiedOn: Schema.optionalWith(Schema.Number, { exact: true }),
  createdOn: Schema.optionalWith(Schema.Number, { exact: true })
})
export type CardVersionSummary = Schema.Schema.Type<typeof CardVersionSummarySchema>

export const ListCardVersionsParamsSchema = Schema.Struct({
  cardSpace: CardSpaceIdentifier.annotations({
    description: "Exact card-space name or ID."
  }),
  card: CardIdentifier.annotations({
    description:
      "Any card version ID or exact title. The server resolves its internal version-chain identity automatically."
  }),
  limit: Schema.optionalWith(
    LimitParam.annotations({
      description: `Maximum versions in this page (default: ${DEFAULT_LIMIT}). total always counts the full history.`
    }),
    { exact: true }
  )
}).annotations({
  title: "ListCardVersionsParams",
  description: "Read one page of a Huly card's version history without creating or restoring versions."
})
export type ListCardVersionsParams = Schema.Schema.Type<typeof ListCardVersionsParamsSchema>

const ListCardVersionsResultBaseSchema = Schema.Struct({
  versions: Schema.Array(CardVersionSummarySchema),
  total: Count,
  hasMore: Schema.Boolean
})

export const ListCardVersionsResultSchema = ListCardVersionsResultBaseSchema.pipe(
  Schema.filter((result) => {
    if (result.versions.length > result.total) {
      return "versions page cannot contain more entries than total."
    }
    if (result.hasMore !== (result.versions.length < result.total)) {
      return "hasMore must truthfully indicate whether total exceeds the returned page."
    }
    return undefined
  })
)
export type ListCardVersionsResult = Schema.Schema.Type<typeof ListCardVersionsResultSchema>

export const listCardVersionsParamsJsonSchema = JSONSchema.make(ListCardVersionsParamsSchema)
export const parseListCardVersionsParams = Schema.decodeUnknown(ListCardVersionsParamsSchema)
