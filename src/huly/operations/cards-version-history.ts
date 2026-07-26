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
import { HulyClient, type HulyClientError, type HulyClientOperations } from "../client.js"
import { CardNotFoundError, CardSpaceNotFoundError, HulyError } from "../errors.js"
import { cardPlugin } from "../huly-plugins.js"
import { clampLimit, hulyQuery } from "./query-helpers.js"
import { toClassRef, toRef } from "./sdk-boundary.js"

type VersionableCardDoc = HulyCard & VersionableDoc

const optionalBoolean = (value: unknown): boolean | undefined => typeof value === "boolean" ? value : undefined
const optionalTimestamp = (value: unknown): TimestampType | undefined =>
  Option.getOrUndefined(Schema.decodeUnknownOption(Timestamp)(value))

/**
 * Parse Huly's independently nullable VersionableDoc fields into one coherent
 * domain state. A partial or malformed state is intentionally represented as
 * absent so callers never observe an impossible version metadata combination.
 */
export const cardVersionMetadata = (card: HulyCard): CardVersionMetadata | undefined => {
  const isLatest = optionalBoolean(Reflect.get(card, "isLatest"))
  const readonly = optionalBoolean(Reflect.get(card, "readonly"))
  const candidate = {
    number: Reflect.get(card, "version"),
    chainId: Reflect.get(card, "baseId"),
    ...(isLatest === undefined ? {} : { isLatest }),
    ...(readonly === undefined ? {} : { readonly })
  }
  return Option.getOrUndefined(Schema.decodeUnknownOption(CardVersionMetadataSchema)(candidate))
}

interface CardVersionEntry {
  readonly card: HulyCard
  readonly metadata: CardVersionMetadata | undefined
  readonly summary: CardVersionSummary
}

const toEntry = (card: HulyCard): CardVersionEntry => {
  const metadata = cardVersionMetadata(card)
  const modifiedOn = optionalTimestamp(card.modifiedOn)
  const createdOn = optionalTimestamp(card.createdOn)
  const summary: CardVersionSummary = {
    id: CardIdSchema.make(card._id),
    title: card.title,
    ...(metadata === undefined ? {} : { version: metadata }),
    ...(modifiedOn === undefined ? {} : { modifiedOn }),
    ...(createdOn === undefined ? {} : { createdOn })
  }
  return { card, metadata, summary }
}

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
    : String(left.card._id).localeCompare(String(right.card._id))
}

const versionIdentity = (entry: CardVersionEntry): CardVersionChainId | CardId =>
  entry.metadata?.chainId ?? entry.summary.id

const allVersionStates = { $in: [true, false] }

const resolveHistoryCard = (
  client: HulyClientOperations,
  space: Ref<HulyCardSpace>,
  identifier: CardIdentifier,
  cardSpaceIdentifier: ListCardVersionsParams["cardSpace"]
): Effect.Effect<HulyCard, HulyClientError | CardNotFoundError | HulyError> =>
  Effect.gen(function*() {
    const idMatches = yield* client.findAll<HulyCard>(
      cardPlugin.class.Card,
      hulyQuery<HulyCard>({ space, _id: toRef<HulyCard>(identifier) })
    )
    if (idMatches[0] !== undefined) return idMatches[0]

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
    const titleMatches = [
      ...new Map(
        [...versionedTitleMatches, ...allRuntimeTitleMatches].map((card) => [card._id, card] as const)
      ).values()
    ]
    if (titleMatches.length === 0) {
      return yield* new CardNotFoundError({ identifier, cardSpace: cardSpaceIdentifier })
    }

    const entries = titleMatches.map(toEntry)
    const identities = new Set(entries.map(versionIdentity))
    if (identities.size > 1) {
      return yield* new HulyError({
        message:
          `Card title '${identifier}' matches ${identities.size} version chains in card space '${cardSpaceIdentifier}'; use a card ID`,
        cause: "ambiguous card version history title"
      })
    }
    const firstMatch = entries.sort(compareVersions)[0]?.card
    return firstMatch === undefined
      ? yield* new CardNotFoundError({ identifier, cardSpace: cardSpaceIdentifier })
      : firstMatch
  })

const fetchHistory = (
  client: HulyClientOperations,
  space: Ref<HulyCardSpace>,
  resolved: HulyCard
): Effect.Effect<ReadonlyArray<CardVersionEntry>, HulyClientError> => {
  const resolvedEntry = toEntry(resolved)
  const metadata = resolvedEntry.metadata
  if (metadata === undefined) return Effect.succeed([resolvedEntry])

  return Effect.map(
    client.findAll<VersionableCardDoc>(
      toClassRef<VersionableCardDoc>(cardPlugin.class.Card),
      hulyQuery<VersionableCardDoc>({
        space,
        baseId: toRef<Doc>(metadata.chainId)
      })
    ),
    (matches) =>
      [...new Map([...matches, resolved].map((card) => [String(card._id), card] as const)).values()]
        .map(toEntry)
        .sort(compareVersions)
  )
}

export const listCardVersions = (
  params: ListCardVersionsParams
): Effect.Effect<
  ListCardVersionsResult,
  HulyClientError | CardNotFoundError | CardSpaceNotFoundError | HulyError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
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
    const page = history.slice(0, clampLimit(params.limit))
    return {
      versions: page.map((entry) => entry.summary),
      total: Count.make(history.length),
      hasMore: page.length < history.length
    }
  })
