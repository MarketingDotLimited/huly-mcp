import { Schema } from "effect"

import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import {
  CardId,
  CardIdentifier,
  CardSpaceIdentifier,
  Count,
  DEFAULT_LIMIT,
  LimitParam,
  NonEmptyString,
  Timestamp
} from "./shared.js"

export const CardVersionNumber = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0)),
  Schema.brand("CardVersionNumber")
).annotate({
  identifier: "CardVersionNumber",
  title: "CardVersionNumber",
  description: "Positive integer assigned by Huly's versioning middleware."
})
export type CardVersionNumber = Schema.Schema.Type<typeof CardVersionNumber>

export const CardVersionChainId = NonEmptyString.pipe(Schema.brand("CardVersionChainId")).annotate({
  identifier: "CardVersionChainId",
  title: "CardVersionChainId",
  description: "Huly baseId shared by every card in one version chain."
})
export type CardVersionChainId = Schema.Schema.Type<typeof CardVersionChainId>

export const CardVersionMetadataSchema = Schema.Struct({
  number: CardVersionNumber,
  chainId: CardVersionChainId,
  isLatest: Schema.optionalKey(Schema.Boolean),
  readonly: Schema.optionalKey(Schema.Boolean)
})
export type CardVersionMetadata = Schema.Schema.Type<typeof CardVersionMetadataSchema>

export const CardVersionSummarySchema = Schema.Struct({
  id: CardId,
  title: Schema.String,
  version: Schema.optionalKey(CardVersionMetadataSchema),
  modifiedOn: Schema.optionalKey(Timestamp),
  createdOn: Schema.optionalKey(Timestamp)
})
export type CardVersionSummary = Schema.Schema.Type<typeof CardVersionSummarySchema>

export const ListCardVersionsParamsSchema = Schema.Struct({
  cardSpace: CardSpaceIdentifier.annotateKey({ description: "Exact card-space name or ID." }),
  card: CardIdentifier.annotate({
    description:
      "Any card version ID or exact title. The server resolves its internal version-chain identity automatically."
  }),
  limit: Schema.optionalKey(
    LimitParam.annotate({
      description: `Maximum versions in this page (default: ${DEFAULT_LIMIT}). total always counts the full history.`
    })
  )
}).annotate({
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
  Schema.check(
    Schema.makeFilter((result) => {
      if (result.versions.length > result.total) {
        return "versions page cannot contain more entries than total."
      }
      if (result.hasMore !== result.versions.length < result.total) {
        return "hasMore must truthfully indicate whether total exceeds the returned page."
      }
      return undefined
    })
  )
)
export type ListCardVersionsResult = Schema.Schema.Type<typeof ListCardVersionsResultSchema>

export const listCardVersionsParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(ListCardVersionsParamsSchema),
  {
    cardSpace: "Exact card-space name or ID.",
    card: "Card version ID or exact title.",
    limit: "Maximum versions in this page."
  }
)
export const parseListCardVersionsParams = Schema.decodeUnknownEffect(ListCardVersionsParamsSchema)
