import { type Class, type Doc, type FindOptions, SortingOrder } from "@hcengineering/core"
import type {
  NotificationProvider as HulyNotificationProvider,
  NotificationType as HulyNotificationType
} from "@hcengineering/notification"
import { Array as EffectArray, Effect, Order, Result, Schema } from "effect"

import { DisplayText, NotificationFieldName, NotificationProviderOrder } from "../../domain/schemas/domain-values.js"
import type { NotificationProvider, NotificationType } from "../../domain/schemas/notification-preferences.js"
import {
  Count,
  DocId,
  NotificationProviderId,
  NotificationTypeId,
  ObjectClassName
} from "../../domain/schemas/shared.js"
import { NotificationMetadataDegradedWarningCode } from "../../domain/schemas/tool-warnings.js"
import type { HulyClientError, HulyClientOperations } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import { NotificationProviderNotFoundError, NotificationTypeNotFoundError } from "../errors.js"
import { notification } from "../huly-plugins.js"
import {
  executeMetadataIdRequirement,
  executeMetadataLoad,
  type NotificationMetadataResult,
  type ParsedRows
} from "./notification-metadata-execution.js"
import {
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
  order: NotificationProviderOrder,
  depends: Schema.optional(NotificationProviderId)
}).annotate({
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
}).annotate({
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

const parseRows = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  rows: ReadonlyArray<unknown>
): ParsedRows<S["Type"]> => {
  const decode = Schema.decodeUnknownResult(schema)
  const parsed = rows.map((row) => decode(row))
  return {
    rows: parsed.flatMap((row) => (Result.isSuccess(row) ? [row.success] : [])),
    invalidRows: Count.make(parsed.filter(Result.isFailure).length)
  }
}

const displayText = (value: unknown): DisplayText | undefined => {
  const parsed = Schema.decodeUnknownResult(DisplayText)(value)
  return Result.isSuccess(parsed) ? parsed.success : undefined
}

interface PresentationProjection<A> {
  readonly summary: A
  readonly omittedFields: Count
}

const providerProjection = (provider: ProviderBoundary): PresentationProjection<NotificationProvider> => {
  const label = displayText(provider.label)
  const description = displayText(provider.description)
  return {
    summary: {
      id: provider._id,
      ...(label === undefined ? {} : { label }),
      ...(description === undefined ? {} : { description }),
      defaultEnabled: provider.defaultEnabled,
      canDisable: provider.canDisable,
      order: provider.order,
      ...(provider.depends === undefined ? {} : { depends: provider.depends })
    },
    omittedFields: Count.make(Number(label === undefined) + Number(description === undefined))
  }
}

const typeProjection = (type: TypeBoundary): PresentationProjection<NotificationType> => {
  const label = displayText(type.label)
  return {
    summary: {
      id: type._id,
      ...(label === undefined ? {} : { label }),
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
    },
    omittedFields: Count.make(Number(label === undefined))
  }
}

const totalOmittedFields = <A>(projections: ReadonlyArray<PresentationProjection<A>>): Count =>
  Count.make(projections.reduce((total, projection) => total + projection.omittedFields, 0))

type ProviderMetadataLoaderConfig = ProviderMetadataDefinition & {
  readonly query: StrictDocumentQuery<HulyNotificationProvider>
  readonly options: FindOptions<HulyNotificationProvider>
}

type TypeMetadataLoaderConfig = TypeMetadataDefinition & {
  readonly query: StrictDocumentQuery<HulyNotificationType>
  readonly options: FindOptions<HulyNotificationType>
}

type NotificationMetadataLoaderConfig = ProviderMetadataLoaderConfig | TypeMetadataLoaderConfig

const loadProviderMetadata = (
  client: HulyClientOperations,
  config: ProviderMetadataLoaderConfig
): Effect.Effect<NotificationMetadataResult<ProviderBoundary>, HulyClientError, Diagnostics> =>
  executeMetadataLoad({
    loadModelRows: () =>
      client.findAllInModel<HulyNotificationProvider>(
        config.classRef,
        hulyQuery<HulyNotificationProvider>(config.query)
      ),
    loadRemoteRows: () =>
      client.findAll<HulyNotificationProvider>(
        config.classRef,
        hulyQuery<HulyNotificationProvider>(config.query),
        config.options
      ),
    parse: (rows) => parseRows(config.schema, rows),
    warnInvalidModelRows: (warning) => warnInvalidAuthoritativeNotificationMetadata({ ...config, ...warning }),
    warnFallback: (warning) => warnNotificationMetadataFallback({ ...config, ...warning })
  })

const loadTypeMetadata = (
  client: HulyClientOperations,
  config: TypeMetadataLoaderConfig
): Effect.Effect<NotificationMetadataResult<TypeBoundary>, HulyClientError, Diagnostics> =>
  executeMetadataLoad({
    loadModelRows: () =>
      client.findAllInModel<HulyNotificationType>(config.classRef, hulyQuery<HulyNotificationType>(config.query)),
    loadRemoteRows: () =>
      client.findAll<HulyNotificationType>(
        config.classRef,
        hulyQuery<HulyNotificationType>(config.query),
        config.options
      ),
    parse: (rows) => parseRows(config.schema, rows),
    warnInvalidModelRows: (warning) => warnInvalidAuthoritativeNotificationMetadata({ ...config, ...warning }),
    warnFallback: (warning) => warnNotificationMetadataFallback({ ...config, ...warning })
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
      return loadProviderMetadata(client, config)
    case "type":
      return loadTypeMetadata(client, config)
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
  }).pipe(
    Effect.flatMap((result) =>
      Effect.gen(function* () {
        const projections = result.rows.map(providerProjection)
        yield* warnOmittedNotificationPresentationMetadata({
          ...providerMetadataDefinition,
          omittedFields: totalOmittedFields(projections),
          authoritative: result.authoritative
        })
        return {
          ...result,
          rows: EffectArray.sortBy(Order.mapInput(Order.Number, (provider: NotificationProvider) => provider.order))(
            projections.map((projection) => projection.summary)
          ).slice(0, limit)
        }
      })
    )
  )

export const loadNotificationTypes = (
  client: HulyClientOperations,
  params: { readonly limit?: number; readonly includeHidden?: boolean; readonly objectClass?: ObjectClassName }
): Effect.Effect<NotificationMetadataResult<NotificationType>, HulyClientError, Diagnostics> => {
  const query: StrictDocumentQuery<HulyNotificationType> = {
    ...(params.includeHidden ? {} : { hidden: false }),
    ...(params.objectClass === undefined ? {} : { objectClass: toRef<Class<Doc>>(params.objectClass) })
  }
  return loadMetadata(client, { ...typeMetadataDefinition, query, options: { limit: clampLimit(params.limit) } }).pipe(
    Effect.flatMap((result) =>
      Effect.gen(function* () {
        const projections = result.rows.map(typeProjection)
        yield* warnOmittedNotificationPresentationMetadata({
          ...typeMetadataDefinition,
          omittedFields: totalOmittedFields(projections),
          authoritative: result.authoritative
        })
        return {
          ...result,
          rows: projections.map((projection) => projection.summary).slice(0, clampLimit(params.limit))
        }
      })
    )
  )
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

const warnTrustedIdentifier = (config: NotificationMetadataIdConfig): Effect.Effect<void, never, Diagnostics> =>
  Effect.gen(function* () {
    const diagnostics = yield* Diagnostics
    yield* diagnostics.warnAgent({
      code: NotificationMetadataDegradedWarningCode,
      message:
        `Authoritative notification ${config._tag} definitions were unavailable, so this compatible REST operation ` +
        `trusted caller-supplied ${config._tag} ID '${config.identifier}'. Confirm the ID with list_notification_${config._tag}s ` +
        "after upgrading Huly or restoring model metadata; an invalid ID may leave the requested setting unchanged."
    })
  })

const findMetadataId = <Identifier extends string>(
  rows: ReadonlyArray<{ readonly _id: Identifier }>,
  identifier: Identifier
): Identifier | undefined => rows.find((row) => row._id === identifier)?._id

const requireProviderMetadataId = (
  client: HulyClientOperations,
  config: ProviderMetadataIdConfig
): Effect.Effect<NotificationProviderId, HulyClientError | NotificationProviderNotFoundError, Diagnostics> =>
  executeMetadataIdRequirement({
    loadModelRows: () =>
      client.findAllInModel<HulyNotificationProvider>(config.classRef, hulyQuery<HulyNotificationProvider>({})),
    loadRemoteRows: () =>
      client.findAll<HulyNotificationProvider>(
        config.classRef,
        hulyQuery<HulyNotificationProvider>({ _id: toRef<HulyNotificationProvider>(config.identifier) }),
        { limit: 1 }
      ),
    parse: (rows) => parseRows(config.schema, rows),
    findIdentifier: (rows) => findMetadataId(rows, config.identifier),
    notFound: () => config.notFound,
    warnInvalidModelRows: (warning) => warnInvalidAuthoritativeNotificationMetadata({ ...config, ...warning }),
    warnFallback: (warning) => warnNotificationMetadataFallback({ ...config, ...warning }),
    warnTrustedIdentifier: () => warnTrustedIdentifier(config),
    trustedIdentifier: () => config.identifier
  })

const requireTypeMetadataId = (
  client: HulyClientOperations,
  config: TypeMetadataIdConfig
): Effect.Effect<NotificationTypeId, HulyClientError | NotificationTypeNotFoundError, Diagnostics> =>
  executeMetadataIdRequirement({
    loadModelRows: () =>
      client.findAllInModel<HulyNotificationType>(config.classRef, hulyQuery<HulyNotificationType>({})),
    loadRemoteRows: () =>
      client.findAll<HulyNotificationType>(
        config.classRef,
        hulyQuery<HulyNotificationType>({ _id: toRef<HulyNotificationType>(config.identifier) }),
        { limit: 1 }
      ),
    parse: (rows) => parseRows(config.schema, rows),
    findIdentifier: (rows) => findMetadataId(rows, config.identifier),
    notFound: () => config.notFound,
    warnInvalidModelRows: (warning) => warnInvalidAuthoritativeNotificationMetadata({ ...config, ...warning }),
    warnFallback: (warning) => warnNotificationMetadataFallback({ ...config, ...warning }),
    warnTrustedIdentifier: () => warnTrustedIdentifier(config),
    trustedIdentifier: () => config.identifier
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
      return requireProviderMetadataId(client, config)
    case "type":
      return requireTypeMetadataId(client, config)
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
