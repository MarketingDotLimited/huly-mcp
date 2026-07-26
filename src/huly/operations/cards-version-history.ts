import type { Card as HulyCard, CardSpace as HulyCardSpace } from "@hcengineering/card"
import type { Doc, Ref, VersionableDoc } from "@hcengineering/core"
import { Effect, Option, Schema } from "effect"

import type {
  CardVersionChainId,
  CardVersionMetadata,
  CardVersionSummary,
  ListCardVersionsParams,
  ListCardVersionsResult
} from "../../domain/schemas/card-versions.js"
import { CardVersionMetadataSchema } from "../../domain/schemas/card-versions.js"
import type { CardId, CardIdentifier, Timestamp as TimestampType } from "../../domain/schemas/shared.js"
import { CardId as CardIdSchema, Count, Timestamp } from "../../domain/schemas/shared.js"
import { CardVersionMetadataDegradedWarningCode } from "../../domain/schemas/tool-warnings.js"
import { HulyClient, type HulyClientError, type HulyClientOperations } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import { CardNotFoundError, CardSpaceNotFoundError, HulyConnectionError, HulyError } from "../errors.js"
import { cardPlugin } from "../huly-plugins.js"
import { clampLimit, hulyQuery } from "./query-helpers.js"
import { toClassRef, toRef } from "./sdk-boundary.js"

type VersionableCardDoc = HulyCard & VersionableDoc

const optionalBoolean = (value: unknown): boolean | undefined => typeof value === "boolean" ? value : undefined

type ParsedTimestamp =
  | { readonly _tag: "absent" }
  | { readonly _tag: "valid"; readonly value: TimestampType }
  | { readonly _tag: "malformed" }

const parseOptionalTimestamp = (value: unknown): ParsedTimestamp => {
  if (value === undefined) return { _tag: "absent" }
  return Option.match(Schema.decodeUnknownOption(Timestamp)(value), {
    onNone: () => ({ _tag: "malformed" }),
    onSome: (timestamp) => ({ _tag: "valid", value: timestamp })
  })
}

/**
 * Parse Huly's independently nullable VersionableDoc fields into one coherent
 * domain state. A partial or malformed state is intentionally represented as
 * absent so callers never observe an impossible version metadata combination.
 */
interface CardVersionMetadataFields {
  readonly version?: unknown
  readonly baseId?: unknown
  readonly isLatest?: unknown
  readonly readonly?: unknown
}

const parseCardVersionMetadataFields = (fields: CardVersionMetadataFields): CardVersionMetadata | undefined => {
  const isLatest = optionalBoolean(fields.isLatest)
  const readonly = optionalBoolean(fields.readonly)
  const candidate = {
    number: fields.version,
    chainId: fields.baseId,
    ...(isLatest === undefined ? {} : { isLatest }),
    ...(readonly === undefined ? {} : { readonly })
  }
  return Option.getOrUndefined(Schema.decodeUnknownOption(CardVersionMetadataSchema)(candidate))
}

export const cardVersionMetadata = (card: HulyCard): CardVersionMetadata | undefined =>
  parseCardVersionMetadataFields({
    version: Reflect.get(card, "version"),
    baseId: Reflect.get(card, "baseId"),
    isLatest: Reflect.get(card, "isLatest"),
    readonly: Reflect.get(card, "readonly")
  })

interface CardVersionEntry {
  readonly metadata: CardVersionMetadata | undefined
  readonly summary: CardVersionSummary
  readonly malformedTimestampFields: ReadonlyArray<"createdOn" | "modifiedOn">
}

const CardHistoryProjectionSchema = Schema.Struct({
  _id: CardIdSchema,
  title: Schema.String,
  version: Schema.optionalWith(Schema.Unknown, { exact: true }),
  baseId: Schema.optionalWith(Schema.Unknown, { exact: true }),
  isLatest: Schema.optionalWith(Schema.Unknown, { exact: true }),
  readonly: Schema.optionalWith(Schema.Unknown, { exact: true }),
  modifiedOn: Schema.optionalWith(Schema.Unknown, { exact: true }),
  createdOn: Schema.optionalWith(Schema.Unknown, { exact: true })
})

type CardHistoryProjection = Schema.Schema.Type<typeof CardHistoryProjectionSchema>

const entryFromProjection = (card: CardHistoryProjection): CardVersionEntry => {
  const metadata = parseCardVersionMetadataFields(card)
  const modifiedOn = parseOptionalTimestamp(card.modifiedOn)
  const createdOn = parseOptionalTimestamp(card.createdOn)
  const summary: CardVersionSummary = {
    id: card._id,
    title: card.title,
    ...(metadata === undefined ? {} : { version: metadata }),
    ...(modifiedOn._tag === "valid" ? { modifiedOn: modifiedOn.value } : {}),
    ...(createdOn._tag === "valid" ? { createdOn: createdOn.value } : {})
  }
  return {
    metadata,
    summary,
    malformedTimestampFields: [
      ...(modifiedOn._tag === "malformed" ? ["modifiedOn" as const] : []),
      ...(createdOn._tag === "malformed" ? ["createdOn" as const] : [])
    ]
  }
}

const toEntry = (card: unknown): Effect.Effect<CardVersionEntry, HulyConnectionError> =>
  Schema.decodeUnknown(CardHistoryProjectionSchema)(card).pipe(
    Effect.map(entryFromProjection),
    Effect.mapError((parseError) =>
      new HulyConnectionError({
        message: `Huly card version history row failed schema validation: ${parseError.message}`,
        cause: parseError
      })
    )
  )

const compareOptionalNumber = (left: number | undefined, right: number | undefined): number => {
  if (left === undefined) return right === undefined ? 0 : 1
  if (right === undefined) return -1
  return left - right
}

const compareVersions = (left: CardVersionEntry, right: CardVersionEntry): number => {
  const numberOrder = compareOptionalNumber(left.metadata?.number, right.metadata?.number)
  if (numberOrder !== 0) return numberOrder
  const createdOrder = compareOptionalNumber(left.summary.createdOn, right.summary.createdOn)
  if (createdOrder !== 0) return createdOrder
  const modifiedOrder = compareOptionalNumber(left.summary.modifiedOn, right.summary.modifiedOn)
  return modifiedOrder !== 0
    ? modifiedOrder
    : left.summary.id.localeCompare(right.summary.id)
}

const versionIdentity = (entry: CardVersionEntry): CardVersionChainId | CardId =>
  entry.metadata?.chainId ?? entry.summary.id

const allVersionStates = { $in: [true, false] }

const resolveHistoryCard = (
  client: HulyClientOperations,
  space: Ref<HulyCardSpace>,
  identifier: CardIdentifier,
  cardSpaceIdentifier: ListCardVersionsParams["cardSpace"]
): Effect.Effect<CardVersionEntry, HulyClientError | CardNotFoundError | HulyError> =>
  Effect.gen(function*() {
    const idMatches = yield* client.findAll<HulyCard>(
      cardPlugin.class.Card,
      hulyQuery<HulyCard>({ space, _id: toRef<HulyCard>(identifier) })
    )
    if (idMatches[0] !== undefined) return yield* toEntry(idMatches[0])

    // An explicit isLatest predicate prevents VersioningMiddleware from
    // silently hiding exact-title matches on superseded versions.
    const versionedTitleMatches = yield* client.findAll<VersionableCardDoc>(
      toClassRef<VersionableCardDoc>(cardPlugin.class.Card),
      hulyQuery<VersionableCardDoc>({ space, title: identifier, isLatest: allVersionStates })
    )
    const allRuntimeTitleMatches = yield* client.findAll<HulyCard>(
      cardPlugin.class.Card,
      // _id exists on every stored card and suppresses VersioningMiddleware's
      // implicit latest-only predicate, including for null legacy fields.
      hulyQuery<HulyCard>({ space, title: identifier, _id: { $exists: true } })
    )
    const titleEntries = yield* Effect.forEach(
      [...versionedTitleMatches, ...allRuntimeTitleMatches],
      toEntry
    )
    const entries = [...new Map(titleEntries.map((entry) => [entry.summary.id, entry] as const)).values()]
    if (entries.length === 0) {
      return yield* new CardNotFoundError({ identifier, cardSpace: cardSpaceIdentifier })
    }

    const identities = new Set(entries.map(versionIdentity))
    if (identities.size > 1) {
      return yield* new HulyError({
        message:
          `Card title '${identifier}' matches ${identities.size} version chains in card space '${cardSpaceIdentifier}'; use a card ID`,
        cause: "ambiguous card version history title"
      })
    }
    const firstMatch = entries.sort(compareVersions)[0]
    return firstMatch === undefined
      ? yield* new CardNotFoundError({ identifier, cardSpace: cardSpaceIdentifier })
      : firstMatch
  })

const fetchHistory = (
  client: HulyClientOperations,
  space: Ref<HulyCardSpace>,
  resolved: CardVersionEntry
): Effect.Effect<ReadonlyArray<CardVersionEntry>, HulyClientError> => {
  const metadata = resolved.metadata
  if (metadata === undefined) return Effect.succeed([resolved])

  return Effect.flatMap(
    client.findAll<VersionableCardDoc>(
      toClassRef<VersionableCardDoc>(cardPlugin.class.Card),
      hulyQuery<VersionableCardDoc>({
        space,
        baseId: toRef<Doc>(metadata.chainId)
      })
    ),
    (matches) =>
      Effect.map(
        Effect.forEach(matches, toEntry),
        (entries) =>
          [...new Map([...entries, resolved].map((entry) => [entry.summary.id, entry] as const)).values()]
            .sort(compareVersions)
      )
  )
}

export const listCardVersions = (
  params: ListCardVersionsParams
): Effect.Effect<
  ListCardVersionsResult,
  HulyClientError | CardNotFoundError | CardSpaceNotFoundError | HulyError,
  HulyClient | Diagnostics
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const diagnostics = yield* Diagnostics
    const cardSpaces = yield* client.findAll<HulyCardSpace>(
      cardPlugin.class.CardSpace,
      hulyQuery<HulyCardSpace>({ name: params.cardSpace, archived: false })
    )
    const cardSpace = cardSpaces[0] ?? (yield* client.findAll<HulyCardSpace>(
      cardPlugin.class.CardSpace,
      hulyQuery<HulyCardSpace>({ _id: toRef<HulyCardSpace>(params.cardSpace) })
    ))[0]
    if (cardSpace === undefined) {
      return yield* new CardSpaceNotFoundError({ identifier: params.cardSpace })
    }

    const resolved = yield* resolveHistoryCard(client, cardSpace._id, params.card, params.cardSpace)
    const history = yield* fetchHistory(client, cardSpace._id, resolved)
    const malformedTimestamps = history.flatMap((entry) =>
      entry.malformedTimestampFields.map((field) => `${entry.summary.id}.${field}`)
    )
    if (malformedTimestamps.length > 0) {
      yield* diagnostics.warnAgent({
        code: CardVersionMetadataDegradedWarningCode,
        message:
          `${malformedTimestamps.length} card version timestamp field(s) failed Effect Schema parsing and were omitted: `
          + `${
            malformedTimestamps.join(", ")
          }. Treat the affected history ordering as degraded and inspect or repair the Huly card data.`
      })
    }
    const page = history.slice(0, clampLimit(params.limit))
    return {
      versions: page.map((entry) => entry.summary),
      total: Count.make(history.length),
      hasMore: page.length < history.length
    }
  })
