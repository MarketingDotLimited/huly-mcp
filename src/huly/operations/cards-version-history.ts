import type { Card as HulyCard, CardSpace as HulyCardSpace } from "@hcengineering/card"
import type { Doc, Ref, VersionableDoc } from "@hcengineering/core"
import { Effect, Option, Schema } from "effect"

import type {
  CardVersionChainId,
  CardVersionMetadata,
  CardVersionNumber,
  CardVersionSummary,
  ListCardVersionsParams,
  ListCardVersionsResult
} from "../../domain/schemas/card-versions.js"
import {
  CardVersionChainId as CardVersionChainIdSchema,
  CardVersionNumber as CardVersionNumberSchema
} from "../../domain/schemas/card-versions.js"
import type { CardId, CardIdentifier, Timestamp as TimestampType } from "../../domain/schemas/shared.js"
import { CardId as CardIdSchema, Count, Timestamp } from "../../domain/schemas/shared.js"
import { CardVersionMetadataDegradedWarningCode } from "../../domain/schemas/tool-warnings.js"
import { HulyClient, type HulyClientError, type HulyClientOperations } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import { CardNotFoundError, CardSpaceNotFoundError, HulyConnectionError, HulyError } from "../errors.js"
import { cardPlugin } from "../huly-plugins.js"
import type {
  CardVersionMetadataField,
  CardVersionMetadataFields,
  CoherentCardVersionMetadata,
  OptionalDegradedFields,
  ParsedCardVersionMetadata,
  RecoveredCardVersionMetadata
} from "./card-version-metadata-state.js"
import { clampLimit, hulyQuery } from "./query-helpers.js"
import { toClassRef, toRef } from "./sdk-boundary.js"

type VersionableCardDoc = HulyCard & VersionableDoc

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

type ParsedOptionalBoolean =
  | { readonly _tag: "Absent" }
  | { readonly _tag: "Valid"; readonly value: boolean }
  | { readonly _tag: "Malformed" }

interface ParsedCardVersionFields {
  readonly version: Option.Option<CardVersionNumber>
  readonly chainId: Option.Option<CardVersionChainId>
  readonly isLatest: ParsedOptionalBoolean
  readonly readonly: ParsedOptionalBoolean
}

const isAbsentMetadataValue = (value: unknown): boolean => value === undefined || value === null

const parseOptionalBoolean = (value: unknown): ParsedOptionalBoolean => {
  if (isAbsentMetadataValue(value)) return { _tag: "Absent" }
  return Option.match(Schema.decodeUnknownOption(Schema.Boolean)(value), {
    onNone: () => ({ _tag: "Malformed" }),
    onSome: (parsed) => ({ _tag: "Valid", value: parsed })
  })
}

const parseCardVersionFields = (fields: CardVersionMetadataFields): ParsedCardVersionFields => ({
  version: Schema.decodeUnknownOption(CardVersionNumberSchema)(fields.version),
  chainId: Schema.decodeUnknownOption(CardVersionChainIdSchema)(fields.baseId),
  isLatest: parseOptionalBoolean(fields.isLatest),
  readonly: parseOptionalBoolean(fields.readonly)
})

const optionalDegradedFields = (fields: ParsedCardVersionFields): OptionalDegradedFields => {
  if (fields.isLatest._tag === "Malformed") {
    return fields.readonly._tag === "Malformed" ? ["isLatest", "readonly"] : ["isLatest"]
  }
  return fields.readonly._tag === "Malformed" ? ["readonly"] : []
}

const metadataFromParsedFields = (
  fields: ParsedCardVersionFields & {
    readonly version: Option.Some<CardVersionNumber>
    readonly chainId: Option.Some<CardVersionChainId>
  }
): CardVersionMetadata => ({
  number: fields.version.value,
  chainId: fields.chainId.value,
  ...(fields.isLatest._tag === "Valid" ? { isLatest: fields.isLatest.value } : {}),
  ...(fields.readonly._tag === "Valid" ? { readonly: fields.readonly.value } : {})
})

const coreMetadataFromParsedFields = (
  fields: ParsedCardVersionFields & {
    readonly version: Option.Some<CardVersionNumber>
    readonly chainId: Option.Some<CardVersionChainId>
  }
): Pick<CardVersionMetadata, "number" | "chainId"> => ({ number: fields.version.value, chainId: fields.chainId.value })

const metadataStateFromRequiredFields = (
  fields: ParsedCardVersionFields & {
    readonly version: Option.Some<CardVersionNumber>
    readonly chainId: Option.Some<CardVersionChainId>
  }
): CoherentCardVersionMetadata | RecoveredCardVersionMetadata => {
  const coreMetadata = coreMetadataFromParsedFields(fields)
  if (fields.isLatest._tag === "Malformed") {
    if (fields.readonly._tag === "Malformed") {
      return {
        _tag: "Degraded",
        resolution: { _tag: "RecoveredMetadata", metadata: coreMetadata },
        degradedFields: ["isLatest", "readonly"]
      }
    }
    return {
      _tag: "Degraded",
      resolution: {
        _tag: "RecoveredMetadata",
        metadata: { ...coreMetadata, ...(fields.readonly._tag === "Valid" ? { readonly: fields.readonly.value } : {}) }
      },
      degradedFields: ["isLatest"]
    }
  }
  if (fields.readonly._tag === "Malformed") {
    return {
      _tag: "Degraded",
      resolution: {
        _tag: "RecoveredMetadata",
        metadata: { ...coreMetadata, ...(fields.isLatest._tag === "Valid" ? { isLatest: fields.isLatest.value } : {}) }
      },
      degradedFields: ["readonly"]
    }
  }
  return { _tag: "Coherent", metadata: metadataFromParsedFields(fields) }
}

export const parseCardVersionMetadataFields = (fields: CardVersionMetadataFields): ParsedCardVersionMetadata => {
  if ([fields.version, fields.baseId, fields.isLatest, fields.readonly].every(isAbsentMetadataValue))
    return { _tag: "Absent" }

  const parsed = parseCardVersionFields(fields)
  const optionalFields = optionalDegradedFields(parsed)
  if (Option.isNone(parsed.version)) {
    if (Option.isNone(parsed.chainId)) {
      return {
        _tag: "Degraded",
        resolution: { _tag: "Unresolved" },
        degradedFields: ["version", "baseId", ...optionalFields]
      }
    }
    return {
      _tag: "Degraded",
      resolution: { _tag: "RecoveredChain", chainId: parsed.chainId.value },
      degradedFields: ["version", ...optionalFields]
    }
  }
  if (Option.isNone(parsed.chainId)) {
    return { _tag: "Degraded", resolution: { _tag: "Unresolved" }, degradedFields: ["baseId", ...optionalFields] }
  }

  const requiredFields = { ...parsed, version: parsed.version, chainId: parsed.chainId }
  return metadataStateFromRequiredFields(requiredFields)
}

export const cardVersionMetadataFromState = (state: ParsedCardVersionMetadata): CardVersionMetadata | undefined => {
  if (state._tag === "Coherent") return state.metadata
  return state._tag === "Degraded" && state.resolution._tag === "RecoveredMetadata"
    ? state.resolution.metadata
    : undefined
}

export const cardVersionDegradedFields = (state: ParsedCardVersionMetadata): ReadonlyArray<CardVersionMetadataField> =>
  state._tag === "Degraded" ? state.degradedFields : []

const cardVersionChainIdFromState = (state: ParsedCardVersionMetadata): CardVersionChainId | undefined => {
  if (state._tag === "Coherent") return state.metadata.chainId
  if (state._tag !== "Degraded") return undefined
  switch (state.resolution._tag) {
    case "RecoveredMetadata":
      return state.resolution.metadata.chainId
    case "RecoveredChain":
      return state.resolution.chainId
    case "Unresolved":
      return undefined
  }
}

export const parseCardVersionMetadata = (card: HulyCard): ParsedCardVersionMetadata =>
  parseCardVersionMetadataFields({
    version: Reflect.get(card, "version"),
    baseId: Reflect.get(card, "baseId"),
    isLatest: Reflect.get(card, "isLatest"),
    readonly: Reflect.get(card, "readonly")
  })

interface CardVersionEntry {
  readonly versionState: ParsedCardVersionMetadata
  readonly summary: CardVersionSummary
  readonly malformedTimestampFields: ReadonlyArray<"createdOn" | "modifiedOn">
}

const CardHistoryProjectionSchema = Schema.Struct({
  _id: CardIdSchema,
  title: Schema.String,
  version: Schema.optionalKey(Schema.Unknown),
  baseId: Schema.optionalKey(Schema.Unknown),
  isLatest: Schema.optionalKey(Schema.Unknown),
  readonly: Schema.optionalKey(Schema.Unknown),
  modifiedOn: Schema.optionalKey(Schema.Unknown),
  createdOn: Schema.optionalKey(Schema.Unknown)
})

type CardHistoryProjection = Schema.Schema.Type<typeof CardHistoryProjectionSchema>

const entryFromProjection = (card: CardHistoryProjection): CardVersionEntry => {
  const versionState = parseCardVersionMetadataFields(card)
  const metadata = cardVersionMetadataFromState(versionState)
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
    versionState,
    summary,
    malformedTimestampFields: [
      ...(modifiedOn._tag === "malformed" ? ["modifiedOn" as const] : []),
      ...(createdOn._tag === "malformed" ? ["createdOn" as const] : [])
    ]
  }
}

const toEntry = (card: unknown): Effect.Effect<CardVersionEntry, HulyConnectionError> =>
  Schema.decodeUnknownEffect(CardHistoryProjectionSchema)(card).pipe(
    Effect.map(entryFromProjection),
    Effect.mapError(
      (parseError) =>
        new HulyConnectionError({
          message: `Huly card version history row failed schema validation: ${parseError.message}`,
          cause: parseError
        })
    )
  )

const SORT_BEFORE = -1

const compareOptionalNumber = (left: number | undefined, right: number | undefined): number => {
  if (left === undefined) return right === undefined ? 0 : 1
  if (right === undefined) return SORT_BEFORE
  return left - right
}

const compareVersions = (left: CardVersionEntry, right: CardVersionEntry): number => {
  const numberOrder = compareOptionalNumber(
    cardVersionMetadataFromState(left.versionState)?.number,
    cardVersionMetadataFromState(right.versionState)?.number
  )
  if (numberOrder !== 0) return numberOrder
  const createdOrder = compareOptionalNumber(left.summary.createdOn, right.summary.createdOn)
  if (createdOrder !== 0) return createdOrder
  const modifiedOrder = compareOptionalNumber(left.summary.modifiedOn, right.summary.modifiedOn)
  return modifiedOrder !== 0 ? modifiedOrder : left.summary.id.localeCompare(right.summary.id)
}

const versionIdentity = (entry: CardVersionEntry): CardVersionChainId | CardId =>
  cardVersionChainIdFromState(entry.versionState) ?? entry.summary.id

const allVersionStates = { $in: [true, false] }

const resolveHistoryCard = (
  client: HulyClientOperations,
  space: Ref<HulyCardSpace>,
  identifier: CardIdentifier,
  cardSpaceIdentifier: ListCardVersionsParams["cardSpace"]
): Effect.Effect<CardVersionEntry, HulyClientError | CardNotFoundError | HulyError> =>
  Effect.gen(function* () {
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
    const titleEntries = yield* Effect.forEach([...versionedTitleMatches, ...allRuntimeTitleMatches], toEntry)
    const entries = [...new Map(titleEntries.map((entry) => [entry.summary.id, entry] as const)).values()]
    if (entries.length === 0) {
      return yield* new CardNotFoundError({ identifier, cardSpace: cardSpaceIdentifier })
    }

    const identities = new Set(entries.map(versionIdentity))
    if (identities.size > 1) {
      return yield* new HulyError({
        message: `Card title '${identifier}' matches ${identities.size} version chains in card space '${cardSpaceIdentifier}'; use a card ID`,
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
): Effect.Effect<ReadonlyArray<CardVersionEntry>, HulyClientError | HulyError> => {
  const chainId = cardVersionChainIdFromState(resolved.versionState)
  if (chainId === undefined) {
    return resolved.versionState._tag === "Degraded"
      ? Effect.fail(
          new HulyError({
            message:
              `Card '${resolved.summary.id}' has no valid version-chain identity; cannot return authoritative history. ` +
              `Malformed or absent fields: ${resolved.versionState.degradedFields.join(", ")}. Inspect or repair the ` +
              "Huly card data.",
            cause: "unresolved degraded card version metadata"
          })
        )
      : Effect.succeed([resolved])
  }

  return Effect.flatMap(
    client.findAll<VersionableCardDoc>(
      toClassRef<VersionableCardDoc>(cardPlugin.class.Card),
      hulyQuery<VersionableCardDoc>({ space, baseId: toRef<Doc>(chainId) })
    ),
    (matches) =>
      Effect.map(Effect.forEach(matches, toEntry), (entries) =>
        [...new Map([...entries, resolved].map((entry) => [entry.summary.id, entry] as const)).values()].sort(
          compareVersions
        )
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
  Effect.gen(function* () {
    const client = yield* HulyClient
    const diagnostics = yield* Diagnostics
    const cardSpaces = yield* client.findAll<HulyCardSpace>(
      cardPlugin.class.CardSpace,
      hulyQuery<HulyCardSpace>({ name: params.cardSpace, archived: false })
    )
    const cardSpace =
      cardSpaces[0] ??
      (yield* client.findAll<HulyCardSpace>(
        cardPlugin.class.CardSpace,
        hulyQuery<HulyCardSpace>({ _id: toRef<HulyCardSpace>(params.cardSpace) })
      ))[0]
    if (cardSpace === undefined) {
      return yield* new CardSpaceNotFoundError({ identifier: params.cardSpace })
    }

    const resolved = yield* resolveHistoryCard(client, cardSpace._id, params.card, params.cardSpace)
    const history = yield* fetchHistory(client, cardSpace._id, resolved)
    const degradedFields = history.flatMap((entry) => [
      ...cardVersionDegradedFields(entry.versionState).map((field) => `${entry.summary.id}.${field}`),
      ...entry.malformedTimestampFields.map((field) => `${entry.summary.id}.${field}`)
    ])
    if (degradedFields.length > 0) {
      yield* diagnostics.warnAgent({
        code: CardVersionMetadataDegradedWarningCode,
        message:
          `${degradedFields.length} card version metadata field(s) were absent or malformed and omitted: ` +
          `${degradedFields.join(", ")}. Treat the affected version metadata and history ordering as degraded and ` +
          "inspect or repair the Huly card data."
      })
    }
    const page = history.slice(0, clampLimit(params.limit))
    return {
      versions: page.map((entry) => entry.summary),
      total: Count.make(history.length),
      hasMore: page.length < history.length
    }
  })
