import { type Class, type Doc, type FindOptions, type Ref, SortingOrder } from "@hcengineering/core"
import type {
  NotificationProvider as HulyNotificationProvider,
  NotificationType as HulyNotificationType
} from "@hcengineering/notification"
import { Array as EffectArray, Effect, Either, Order, Schema } from "effect"

import { DisplayText, NotificationFieldName, NotificationProviderOrder } from "../../domain/schemas/domain-values.js"
import type { NotificationProvider, NotificationType } from "../../domain/schemas/notification-preferences.js"
import { DocId, NotificationProviderId, NotificationTypeId, ObjectClassName } from "../../domain/schemas/shared.js"
import { NotificationMetadataDegradedWarningCode } from "../../domain/schemas/tool-warnings.js"
import type { HulyClientError, HulyClientOperations } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import { NotificationProviderNotFoundError, NotificationTypeNotFoundError } from "../errors.js"
import { notification } from "../huly-plugins.js"
import {
  type ModelMetadataFailure,
  type NotificationMetadataWarningDefinition,
  warnInvalidAuthoritativeNotificationMetadata,
  warnNotificationMetadataFallback,
  warnOmittedNotificationPresentationMetadata
} from "./notification-metadata-warnings.js"
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

type ProviderMetadataDefinition = Extract<NotificationMetadataWarningDefinition, { readonly _tag: "provider" }> & {
  readonly classRef: typeof notification.class.NotificationProvider
  readonly schema: typeof ProviderBoundarySchema
}

type TypeMetadataDefinition = Extract<NotificationMetadataWarningDefinition, { readonly _tag: "type" }> & {
  readonly classRef: typeof notification.class.NotificationType
  readonly schema: typeof TypeBoundarySchema
}

const providerMetadataDefinition = {
  _tag: "provider",
  classRef: notification.class.NotificationProvider,
  schema: ProviderBoundarySchema,
  subject: "notification-provider",
  presentationFields: "label or description"
} satisfies ProviderMetadataDefinition

const typeMetadataDefinition = {
  _tag: "type",
  classRef: notification.class.NotificationType,
  schema: TypeBoundarySchema,
  subject: "notification-type",
  presentationFields: "label"
} satisfies TypeMetadataDefinition

type NotificationMetadataDefinition = ProviderMetadataDefinition | TypeMetadataDefinition
type ModelMetadataLookup = Either.Either<ReadonlyArray<unknown>, HulyClientError>

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

const modelMetadataFailure = <A>(
  result: ModelMetadataLookup,
  rows: ParsedRows<A> | undefined
): ModelMetadataFailure => {
  if (result._tag === "Left") return "unavailable"
  return rows?.invalidRows === 0 ? "empty" : "invalid"
}

type ProviderMetadataLoaderConfig = ProviderMetadataDefinition & {
  readonly query: StrictDocumentQuery<HulyNotificationProvider>
  readonly options: FindOptions<HulyNotificationProvider>
}

type TypeMetadataLoaderConfig = TypeMetadataDefinition & {
  readonly query: StrictDocumentQuery<HulyNotificationType>
  readonly options: FindOptions<HulyNotificationType>
}

type NotificationMetadataLoaderConfig = ProviderMetadataLoaderConfig | TypeMetadataLoaderConfig

const loadConfiguredMetadata = <D extends Doc, A, I>(
  client: HulyClientOperations,
  config: NotificationMetadataDefinition & {
    readonly classRef: Ref<Class<D>>
    readonly schema: Schema.Schema<A, I, never>
    readonly query: StrictDocumentQuery<D>
    readonly options: FindOptions<D>
  }
): Effect.Effect<NotificationMetadataResult<A>, HulyClientError, Diagnostics> =>
  Effect.gen(function*() {
    const modelResult = yield* Effect.either(
      client.findAllInModel<D>(config.classRef, hulyQuery<D>(config.query))
    )
    const modelRows = modelResult._tag === "Right" ? parseRows(config.schema, modelResult.right) : undefined
    if (modelRows !== undefined && modelRows.rows.length > 0) {
      yield* warnInvalidAuthoritativeNotificationMetadata({ ...config, invalidRows: modelRows.invalidRows })
      return { rows: modelRows.rows, authoritative: true }
    }

    const remoteRows = yield* client.findAll<D>(
      config.classRef,
      hulyQuery<D>(config.query),
      config.options
    )
    const parsedRemoteRows = parseRows(config.schema, remoteRows)
    const failure = modelMetadataFailure(modelResult, modelRows)
    yield* warnNotificationMetadataFallback({
      ...config,
      modelFailure: failure,
      invalidRows: parsedRemoteRows.invalidRows
    })
    return { rows: parsedRemoteRows.rows, authoritative: false }
  })

function loadMetadata(
  client: HulyClientOperations,
  config: ProviderMetadataLoaderConfig
): Effect.Effect<NotificationMetadataResult<ProviderBoundary>, HulyClientError, Diagnostics>
function loadMetadata(
  client: HulyClientOperations,
  config: TypeMetadataLoaderConfig
): Effect.Effect<NotificationMetadataResult<TypeBoundary>, HulyClientError, Diagnostics>
function loadMetadata(
  client: HulyClientOperations,
  config: NotificationMetadataLoaderConfig
): Effect.Effect<NotificationMetadataResult<ProviderBoundary | TypeBoundary>, HulyClientError, Diagnostics> {
  switch (config._tag) {
    case "provider":
      return loadConfiguredMetadata(client, config)
    case "type":
      return loadConfiguredMetadata(client, config)
  }
}

export const loadNotificationProviders = (
  client: HulyClientOperations,
  limit: number
): Effect.Effect<NotificationMetadataResult<NotificationProvider>, HulyClientError, Diagnostics> =>
  loadMetadata(client, {
    ...providerMetadataDefinition,
    query: {},
    options: { limit, sort: { order: SortingOrder.Ascending } }
  }).pipe(Effect.flatMap((result) =>
    Effect.gen(function*() {
      const omittedFields = result.rows.reduce(
        (count, provider) =>
          count + Number(displayText(provider.label) === undefined)
          + Number(displayText(provider.description) === undefined),
        0
      )
      yield* warnOmittedNotificationPresentationMetadata({
        ...providerMetadataDefinition,
        omittedFields,
        authoritative: result.authoritative
      })
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
  return loadMetadata(client, {
    ...typeMetadataDefinition,
    query,
    options: { limit: clampLimit(params.limit) }
  }).pipe(Effect.flatMap((result) =>
    Effect.gen(function*() {
      const omittedFields = result.rows.filter((type) => displayText(type.label) === undefined).length
      yield* warnOmittedNotificationPresentationMetadata({
        ...typeMetadataDefinition,
        omittedFields,
        authoritative: result.authoritative
      })
      return { ...result, rows: result.rows.map(typeSummary).slice(0, clampLimit(params.limit)) }
    })
  ))
}

type ProviderMetadataIdConfig = ProviderMetadataDefinition & {
  readonly identifier: NotificationProviderId
  readonly notFound: NotificationProviderNotFoundError
}

type TypeMetadataIdConfig = TypeMetadataDefinition & {
  readonly identifier: NotificationTypeId
  readonly notFound: NotificationTypeNotFoundError
}

type NotificationMetadataIdConfig = ProviderMetadataIdConfig | TypeMetadataIdConfig

const warnTrustedIdentifier = (
  config: NotificationMetadataIdConfig
): Effect.Effect<void, never, Diagnostics> =>
  Effect.gen(function*() {
    const diagnostics = yield* Diagnostics
    yield* diagnostics.warnAgent({
      code: NotificationMetadataDegradedWarningCode,
      message:
        `Authoritative notification ${config._tag} definitions were unavailable, so this compatible REST operation `
        + `trusted caller-supplied ${config._tag} ID '${config.identifier}'. Confirm the ID with list_notification_${config._tag}s `
        + "after upgrading Huly or restoring model metadata; an invalid ID may leave the requested setting unchanged."
    })
  })

const parsedModelRows = <A, I>(
  result: ModelMetadataLookup,
  schema: Schema.Schema<A, I, never>
): ParsedRows<A> | undefined => result._tag === "Right" ? parseRows(schema, result.right) : undefined

const findMetadataId = <Identifier extends string>(
  rows: ReadonlyArray<{ readonly _id: Identifier }>,
  identifier: Identifier
): Identifier | undefined => rows.find((row) => row._id === identifier)?._id

const requireMetadataId = <
  Definition extends NotificationMetadataDefinition,
  D extends Doc,
  Identifier extends string,
  A extends { readonly _id: Identifier },
  I,
  E
>(
  client: HulyClientOperations,
  config: Definition & {
    readonly classRef: Ref<Class<D>>
    readonly schema: Schema.Schema<A, I, never>
    readonly identifier: Identifier
    readonly notFound: E
    readonly trustedWarning: Effect.Effect<void, never, Diagnostics>
  }
): Effect.Effect<Identifier, HulyClientError | E, Diagnostics> =>
  Effect.gen(function*() {
    // Model operations are local/in-memory. Decode the complete authoritative definition set here:
    // list limits are presentation concerns and must never make a valid update identifier disappear.
    const modelResult = yield* Effect.either(client.findAllInModel<D>(config.classRef, hulyQuery<D>({})))
    const modelRows = parsedModelRows(modelResult, config.schema)
    if (modelRows !== undefined && modelRows.rows.length > 0) {
      yield* warnInvalidAuthoritativeNotificationMetadata({ ...config, invalidRows: modelRows.invalidRows })
      const modelIdentifier = findMetadataId(modelRows.rows, config.identifier)
      if (modelIdentifier !== undefined) return modelIdentifier
      return yield* Effect.fail(config.notFound)
    }

    const exactQuery: StrictDocumentQuery<D> = {}
    // eslint-disable-next-line functional/immutable-data -- SDK generic query typing requires a mutable strict builder.
    exactQuery._id = toRef<D>(config.identifier)
    const remoteRows = yield* client.findAll<D>(
      config.classRef,
      hulyQuery<D>(exactQuery),
      { limit: 1 }
    )
    const parsedRemoteRows = parseRows(config.schema, remoteRows)
    const failure = modelMetadataFailure(modelResult, modelRows)
    yield* warnNotificationMetadataFallback({
      ...config,
      modelFailure: failure,
      invalidRows: parsedRemoteRows.invalidRows
    })
    const remoteIdentifier = findMetadataId(parsedRemoteRows.rows, config.identifier)
    if (remoteIdentifier !== undefined) return remoteIdentifier
    yield* config.trustedWarning
    return config.identifier
  })

function requireNotificationMetadataId(
  client: HulyClientOperations,
  config: ProviderMetadataIdConfig
): Effect.Effect<NotificationProviderId, HulyClientError | NotificationProviderNotFoundError, Diagnostics>
function requireNotificationMetadataId(
  client: HulyClientOperations,
  config: TypeMetadataIdConfig
): Effect.Effect<NotificationTypeId, HulyClientError | NotificationTypeNotFoundError, Diagnostics>
function requireNotificationMetadataId(
  client: HulyClientOperations,
  config: NotificationMetadataIdConfig
): Effect.Effect<
  NotificationProviderId | NotificationTypeId,
  HulyClientError | NotificationProviderNotFoundError | NotificationTypeNotFoundError,
  Diagnostics
> {
  switch (config._tag) {
    case "provider":
      return requireMetadataId(client, {
        ...config,
        trustedWarning: warnTrustedIdentifier(config)
      })
    case "type":
      return requireMetadataId(client, {
        ...config,
        trustedWarning: warnTrustedIdentifier(config)
      })
  }
}

export const requireNotificationProviderId = (
  client: HulyClientOperations,
  providerId: NotificationProviderId
): Effect.Effect<NotificationProviderId, HulyClientError | NotificationProviderNotFoundError, Diagnostics> =>
  requireNotificationMetadataId(client, {
    ...providerMetadataDefinition,
    identifier: providerId,
    notFound: new NotificationProviderNotFoundError({ providerId })
  })

export const requireNotificationTypeId = (
  client: HulyClientOperations,
  typeId: NotificationTypeId
): Effect.Effect<NotificationTypeId, HulyClientError | NotificationTypeNotFoundError, Diagnostics> =>
  requireNotificationMetadataId(client, {
    ...typeMetadataDefinition,
    identifier: typeId,
    notFound: new NotificationTypeNotFoundError({ typeId })
  })
