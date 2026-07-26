import { type Class, type Doc, type FindOptions, type Ref, SortingOrder } from "@hcengineering/core"
import type { NotificationType as HulyNotificationType } from "@hcengineering/notification"
import { Array as EffectArray, Effect, Either, Order, Schema } from "effect"

import { DisplayText, NotificationFieldName, NotificationProviderOrder } from "../../domain/schemas/domain-values.js"
import type { NotificationProvider, NotificationType } from "../../domain/schemas/notification-preferences.js"
import { DocId, NotificationProviderId, NotificationTypeId, ObjectClassName } from "../../domain/schemas/shared.js"
import { NotificationMetadataDegradedWarningCode } from "../../domain/schemas/tool-warnings.js"
import type { HulyClientError, HulyClientOperations } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import { NotificationProviderNotFoundError, NotificationTypeNotFoundError } from "../errors.js"
import { notification } from "../huly-plugins.js"
import { clampLimit, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

const ProviderBoundarySchema = Schema.Struct({
  _id: NotificationProviderId,
  label: Schema.optional(Schema.Unknown),
  description: Schema.optional(Schema.Unknown),
  defaultEnabled: Schema.Boolean,
  canDisable: Schema.Boolean,
  order: Schema.Int,
  depends: Schema.optional(NotificationProviderId)
}).annotations({
  title: "NotificationProviderBoundary",
  description: "Huly model-space notification provider fields consumed by MCP notification tools."
})

const TypeBoundarySchema = Schema.Struct({
  _id: NotificationTypeId,
  label: Schema.optional(Schema.Unknown),
  generated: Schema.Boolean,
  hidden: Schema.Boolean,
  defaultEnabled: Schema.Boolean,
  group: Schema.optional(DocId),
  objectClass: ObjectClassName,
  onlyOwn: Schema.optional(Schema.Boolean),
  attachedToClass: Schema.optional(ObjectClassName),
  field: Schema.optional(NotificationFieldName),
  spaceSubscribe: Schema.optional(Schema.Boolean),
  allowedForAuthor: Schema.optional(Schema.Boolean)
}).annotations({
  title: "NotificationTypeBoundary",
  description: "Huly model-space notification type fields consumed by MCP notification tools."
})

type ProviderBoundary = Schema.Schema.Type<typeof ProviderBoundarySchema>
type TypeBoundary = Schema.Schema.Type<typeof TypeBoundarySchema>

interface ParsedRows<A> {
  readonly rows: ReadonlyArray<A>
  readonly invalidRows: number
}

interface NotificationMetadataResult<A> {
  readonly rows: ReadonlyArray<A>
  readonly authoritative: boolean
}

const parseRows = <A, I>(
  schema: Schema.Schema<A, I>,
  rows: ReadonlyArray<unknown>
): ParsedRows<A> => {
  const decode = Schema.decodeUnknownEither(schema)
  const parsed = rows.map((row) => decode(row))
  return {
    rows: parsed.flatMap((row) => Either.isRight(row) ? [row.right] : []),
    invalidRows: parsed.filter(Either.isLeft).length
  }
}

const displayText = (value: unknown): DisplayText | undefined => {
  const parsed = Schema.decodeUnknownEither(DisplayText)(value)
  return Either.isRight(parsed) ? parsed.right : undefined
}

const providerSummary = (provider: ProviderBoundary): NotificationProvider => ({
  id: provider._id,
  ...(displayText(provider.label) === undefined ? {} : { label: displayText(provider.label) }),
  ...(displayText(provider.description) === undefined
    ? {}
    : { description: displayText(provider.description) }),
  defaultEnabled: provider.defaultEnabled,
  canDisable: provider.canDisable,
  order: NotificationProviderOrder.make(provider.order),
  ...(provider.depends === undefined ? {} : { depends: provider.depends })
})

const typeSummary = (type: TypeBoundary): NotificationType => ({
  id: type._id,
  ...(displayText(type.label) === undefined ? {} : { label: displayText(type.label) }),
  generated: type.generated,
  hidden: type.hidden,
  defaultEnabled: type.defaultEnabled,
  ...(type.group === undefined ? {} : { group: type.group }),
  objectClass: type.objectClass,
  ...(type.onlyOwn === undefined ? {} : { onlyOwn: type.onlyOwn }),
  ...(type.attachedToClass === undefined ? {} : { attachedToClass: type.attachedToClass }),
  ...(type.field === undefined ? {} : { field: type.field }),
  ...(type.spaceSubscribe === undefined ? {} : { spaceSubscribe: type.spaceSubscribe }),
  ...(type.allowedForAuthor === undefined ? {} : { allowedForAuthor: type.allowedForAuthor })
})

const warnFallback = (
  subject: string,
  modelFailure: string,
  invalidRows: number
): Effect.Effect<void, never, Diagnostics> =>
  Effect.gen(function*() {
    const diagnostics = yield* Diagnostics
    const invalidDetail = invalidRows === 0
      ? ""
      : ` ${invalidRows} malformed definition row(s) were omitted after Effect Schema parsing.`
    yield* diagnostics.warnAgent({
      code: NotificationMetadataDegradedWarningCode,
      message: `Authoritative Huly model-space ${subject} metadata was ${modelFailure}; `
        + `the result uses the server compatibility fallback.${invalidDetail} `
        + "Treat labels and optional metadata as compatibility data, and use returned IDs for subsequent updates."
    })
  })

const warnInvalidAuthoritativeRows = (
  subject: string,
  invalidRows: number
): Effect.Effect<void, never, Diagnostics> =>
  invalidRows === 0
    ? Effect.void
    : Effect.gen(function*() {
      const diagnostics = yield* Diagnostics
      yield* diagnostics.warnAgent({
        code: NotificationMetadataDegradedWarningCode,
        message:
          `${invalidRows} authoritative Huly model-space ${subject} definition row(s) failed Effect Schema parsing `
          + "and were omitted. Upgrade Huly or inspect model data before trusting the returned metadata as complete."
      })
    })

const warnOmittedPresentationMetadata = (
  subject: string,
  omittedFields: number,
  authoritative: boolean
): Effect.Effect<void, never, Diagnostics> =>
  omittedFields === 0
    ? Effect.void
    : Effect.gen(function*() {
      const diagnostics = yield* Diagnostics
      yield* diagnostics.warnAgent({
        code: NotificationMetadataDegradedWarningCode,
        message:
          `${omittedFields} ${subject} label or description field(s) were missing or malformed and were omitted. `
          + `${
            authoritative ? "The authoritative model rows need repair." : "The server compatibility data is partial."
          } `
          + "Use the returned definition IDs rather than guessing metadata from an omitted label."
      })
    })

const loadMetadata = <D extends Doc, A, I>(
  client: HulyClientOperations,
  classRef: Ref<Class<D>>,
  query: StrictDocumentQuery<D>,
  options: FindOptions<D> | undefined,
  schema: Schema.Schema<A, I, never>,
  subject: string
): Effect.Effect<NotificationMetadataResult<A>, HulyClientError, Diagnostics> =>
  Effect.gen(function*() {
    const modelResult = yield* Effect.either(
      client.findAllInModel<D>(classRef, hulyQuery<D>(query))
    )
    const modelRows = modelResult._tag === "Right" ? parseRows(schema, modelResult.right) : undefined
    if (modelRows !== undefined && modelRows.rows.length > 0) {
      yield* warnInvalidAuthoritativeRows(subject, modelRows.invalidRows)
      return { rows: modelRows.rows, authoritative: true }
    }

    const remoteRows = yield* client.findAll<D>(classRef, hulyQuery<D>(query), options)
    const parsedRemoteRows = parseRows(schema, remoteRows)
    const modelFailure = modelResult._tag === "Left"
      ? "unavailable"
      : modelRows?.invalidRows === 0
      ? "empty"
      : "invalid"
    yield* warnFallback(subject, modelFailure, parsedRemoteRows.invalidRows)
    return { rows: parsedRemoteRows.rows, authoritative: false }
  })

export const loadNotificationProviders = (
  client: HulyClientOperations,
  limit: number
): Effect.Effect<NotificationMetadataResult<NotificationProvider>, HulyClientError, Diagnostics> =>
  loadMetadata(
    client,
    notification.class.NotificationProvider,
    {},
    { limit, sort: { order: SortingOrder.Ascending } },
    ProviderBoundarySchema,
    "notification-provider"
  ).pipe(Effect.flatMap((result) =>
    Effect.gen(function*() {
      const omittedFields = result.rows.reduce(
        (count, provider) =>
          count + Number(displayText(provider.label) === undefined)
          + Number(displayText(provider.description) === undefined),
        0
      )
      yield* warnOmittedPresentationMetadata("notification-provider", omittedFields, result.authoritative)
      return {
        ...result,
        rows: EffectArray.sortBy(
          Order.mapInput(Order.number, (provider: NotificationProvider) => provider.order)
        )(result.rows.map(providerSummary)).slice(0, limit)
      }
    })
  ))

export const loadNotificationTypes = (
  client: HulyClientOperations,
  params: {
    readonly limit?: number
    readonly includeHidden?: boolean
    readonly objectClass?: ObjectClassName
  }
): Effect.Effect<NotificationMetadataResult<NotificationType>, HulyClientError, Diagnostics> => {
  const query: StrictDocumentQuery<HulyNotificationType> = {
    ...(params.includeHidden ? {} : { hidden: false }),
    ...(params.objectClass === undefined ? {} : { objectClass: toRef<Class<Doc>>(params.objectClass) })
  }
  return loadMetadata(
    client,
    notification.class.NotificationType,
    query,
    { limit: clampLimit(params.limit) },
    TypeBoundarySchema,
    "notification-type"
  ).pipe(Effect.flatMap((result) =>
    Effect.gen(function*() {
      const omittedFields = result.rows.filter((type) => displayText(type.label) === undefined).length
      yield* warnOmittedPresentationMetadata("notification-type", omittedFields, result.authoritative)
      return { ...result, rows: result.rows.map(typeSummary).slice(0, clampLimit(params.limit)) }
    })
  ))
}

const warnTrustedIdentifier = (
  kind: "provider" | "type",
  identifier: string
): Effect.Effect<void, never, Diagnostics> =>
  Effect.gen(function*() {
    const diagnostics = yield* Diagnostics
    yield* diagnostics.warnAgent({
      code: NotificationMetadataDegradedWarningCode,
      message: `Authoritative notification ${kind} definitions were unavailable, so this compatible REST operation `
        + `trusted caller-supplied ${kind} ID '${identifier}'. Confirm the ID with list_notification_${kind}s `
        + "after upgrading Huly or restoring model metadata; an invalid ID may leave the requested setting unchanged."
    })
  })

type ModelMetadataLookup = Either.Either<ReadonlyArray<unknown>, HulyClientError>

const parsedModelRows = <A, I>(
  result: ModelMetadataLookup,
  schema: Schema.Schema<A, I, never>
): ParsedRows<A> | undefined => result._tag === "Right" ? parseRows(schema, result.right) : undefined

const modelMetadataFailure = <A>(
  result: ModelMetadataLookup,
  rows: ParsedRows<A> | undefined
): string => {
  if (result._tag === "Left") return "unavailable"
  return rows?.invalidRows === 0 ? "empty" : "invalid"
}

const requireNotificationMetadataId = <
  D extends Doc,
  A extends { readonly _id: string },
  I,
  E
>(
  client: HulyClientOperations,
  classRef: Ref<Class<D>>,
  schema: Schema.Schema<A, I, never>,
  identifier: string,
  subject: string,
  kind: "provider" | "type",
  notFound: () => E
): Effect.Effect<void, HulyClientError | E, Diagnostics> =>
  Effect.gen(function*() {
    // Model operations are local/in-memory. Decode the complete authoritative definition set here:
    // list limits are presentation concerns and must never make a valid update identifier disappear.
    const modelResult = yield* Effect.either(client.findAllInModel<D>(classRef, hulyQuery<D>({})))
    const modelRows = parsedModelRows(modelResult, schema)
    if (modelRows !== undefined && modelRows.rows.length > 0) {
      yield* warnInvalidAuthoritativeRows(subject, modelRows.invalidRows)
      if (modelRows.rows.some((row) => row._id === identifier)) return
      return yield* Effect.fail(notFound())
    }

    const exactQuery: StrictDocumentQuery<D> = {}
    // eslint-disable-next-line functional/immutable-data -- SDK generic query typing requires a mutable strict builder.
    exactQuery._id = toRef<D>(identifier)
    const remoteRows = yield* client.findAll<D>(
      classRef,
      hulyQuery<D>(exactQuery),
      { limit: 1 }
    )
    const parsedRemoteRows = parseRows(schema, remoteRows)
    const modelFailure = modelMetadataFailure(modelResult, modelRows)
    yield* warnFallback(subject, modelFailure, parsedRemoteRows.invalidRows)
    if (parsedRemoteRows.rows.some((row) => row._id === identifier)) return
    yield* warnTrustedIdentifier(kind, identifier)
  })

export const requireNotificationProviderId = (
  client: HulyClientOperations,
  providerId: NotificationProviderId
): Effect.Effect<void, HulyClientError | NotificationProviderNotFoundError, Diagnostics> =>
  requireNotificationMetadataId(
    client,
    notification.class.NotificationProvider,
    ProviderBoundarySchema,
    providerId,
    "notification-provider",
    "provider",
    () => new NotificationProviderNotFoundError({ providerId })
  )

export const requireNotificationTypeId = (
  client: HulyClientOperations,
  typeId: NotificationTypeId
): Effect.Effect<void, HulyClientError | NotificationTypeNotFoundError, Diagnostics> =>
  requireNotificationMetadataId(
    client,
    notification.class.NotificationType,
    TypeBoundarySchema,
    typeId,
    "notification-type",
    "type",
    () => new NotificationTypeNotFoundError({ typeId })
  )
