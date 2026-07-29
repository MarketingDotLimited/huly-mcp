import type { Class, Collaborator as HulyCollaborator, Doc, Ref, Space } from "@hcengineering/core"
import { generateId } from "@hcengineering/core"
import type {
  InboxNotification as HulyInboxNotification,
  NotificationProvider,
  NotificationProviderSetting as HulyNotificationProviderSetting,
  NotificationType as HulyNotificationType,
  NotificationTypeSetting as HulyNotificationTypeSetting
} from "@hcengineering/notification"
import { Effect } from "effect"

import type {
  ArchiveNotificationContextParams,
  ArchiveNotificationContextResult,
  ListNotificationProvidersParams,
  ListNotificationTypesParams,
  NotificationProvider as NotificationProviderSummary,
  NotificationType,
  ObjectNotificationSubscriptionResult,
  SubscribeToObjectNotificationsParams,
  UnarchiveNotificationContextParams,
  UnsubscribeFromObjectNotificationsParams,
  UpdateNotificationTypeSettingParams,
  UpdateNotificationTypeSettingResult
} from "../../domain/schemas/notification-preferences.js"
import {
  Count,
  DocId,
  NotificationContextId,
  NotificationProviderId,
  NotificationTypeId,
  ObjectClassName
} from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import { HulyError, NotificationProviderNotConfigurableError } from "../errors.js"
import type {
  NotificationContextNotFoundError,
  NotificationProviderNotFoundError,
  NotificationTypeNotFoundError
} from "../errors.js"
import { core, notification } from "../huly-plugins.js"
import {
  loadNotificationProviders,
  loadNotificationTypes,
  requireNotificationProviderId,
  requireNotificationTypeId
} from "./notification-metadata.js"
import { findNotificationContext } from "./notifications-shared.js"
import { clampLimit, hulyQuery } from "./query-helpers.js"
import { toClassRef, toRef } from "./sdk-boundary.js"

type UpdateNotificationTypeSettingError =
  | HulyClientError
  | NotificationTypeNotFoundError
  | NotificationProviderNotFoundError
  | NotificationProviderNotConfigurableError

type ArchiveNotificationContextError = HulyClientError | NotificationContextNotFoundError

type ObjectNotificationSubscriptionError = HulyClientError | HulyError

export const listNotificationProviders = (
  params: ListNotificationProvidersParams
): Effect.Effect<ReadonlyArray<NotificationProviderSummary>, HulyClientError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    return (yield* loadNotificationProviders(client, clampLimit(params.limit))).rows
  })

export const listNotificationTypes = (
  params: ListNotificationTypesParams
): Effect.Effect<ReadonlyArray<NotificationType>, HulyClientError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    return (yield* loadNotificationTypes(client, {
      ...(params.limit === undefined ? {} : { limit: params.limit }),
      ...(params.includeHidden === undefined ? {} : { includeHidden: params.includeHidden }),
      ...(params.objectClass === undefined ? {} : { objectClass: params.objectClass })
    })).rows
  })

export const updateNotificationTypeSetting = (
  params: UpdateNotificationTypeSettingParams
): Effect.Effect<UpdateNotificationTypeSettingResult, UpdateNotificationTypeSettingError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    yield* requireNotificationProviderId(client, params.providerId)
    yield* requireNotificationTypeId(client, params.typeId)
    const typeId = toRef<HulyNotificationType>(params.typeId)

    const existingSetting = yield* client.findOne<HulyNotificationTypeSetting>(
      notification.class.NotificationTypeSetting,
      hulyQuery<HulyNotificationTypeSetting>({
        attachedTo: toRef<NotificationProvider>(params.providerId),
        type: typeId
      })
    )

    if (existingSetting !== undefined) {
      if (existingSetting.enabled === params.enabled) {
        return {
          providerId: NotificationProviderId.make(params.providerId),
          typeId: NotificationTypeId.make(params.typeId),
          enabled: params.enabled,
          updated: false,
          created: false
        }
      }

      yield* client.updateDoc(notification.class.NotificationTypeSetting, existingSetting.space, existingSetting._id, {
        enabled: params.enabled
      })

      return {
        providerId: NotificationProviderId.make(params.providerId),
        typeId: NotificationTypeId.make(params.typeId),
        enabled: params.enabled,
        updated: true,
        created: false
      }
    }

    const providerSetting = yield* client.findOne<HulyNotificationProviderSetting>(
      notification.class.NotificationProviderSetting,
      hulyQuery<HulyNotificationProviderSetting>({ attachedTo: toRef<NotificationProvider>(params.providerId) })
    )

    if (providerSetting === undefined) {
      return yield* new NotificationProviderNotConfigurableError({
        providerId: params.providerId,
        typeId: params.typeId
      })
    }

    yield* client.createDoc(notification.class.NotificationTypeSetting, providerSetting.space, {
      attachedTo: toRef<NotificationProvider>(params.providerId),
      type: typeId,
      enabled: params.enabled
    })

    return {
      providerId: NotificationProviderId.make(params.providerId),
      typeId: NotificationTypeId.make(params.typeId),
      enabled: params.enabled,
      updated: true,
      created: true
    }
  })

const setContextNotificationsArchived = (
  params: ArchiveNotificationContextParams,
  archived: boolean
): Effect.Effect<ArchiveNotificationContextResult, ArchiveNotificationContextError, HulyClient> =>
  Effect.gen(function* () {
    const { client, context } = yield* findNotificationContext(params.contextId)

    const notifications = yield* client.findAll<HulyInboxNotification>(
      notification.class.InboxNotification,
      hulyQuery<HulyInboxNotification>({ docNotifyContext: context._id, archived: !archived })
    )

    for (const inboxNotification of notifications) {
      yield* client.updateDoc(notification.class.InboxNotification, inboxNotification.space, inboxNotification._id, {
        archived
      })
    }

    return { contextId: NotificationContextId.make(context._id), archived, count: Count.make(notifications.length) }
  })

export const archiveNotificationContext = (
  params: ArchiveNotificationContextParams
): Effect.Effect<ArchiveNotificationContextResult, ArchiveNotificationContextError, HulyClient> =>
  setContextNotificationsArchived(params, true)

export const unarchiveNotificationContext = (
  params: UnarchiveNotificationContextParams
): Effect.Effect<ArchiveNotificationContextResult, ArchiveNotificationContextError, HulyClient> =>
  setContextNotificationsArchived(params, false)

interface SubscriptionTarget {
  readonly objectId: Ref<Doc>
  readonly objectClass: Ref<Class<Doc>>
  readonly space: Ref<Space>
}

const resolveSubscriptionTarget = (
  params: SubscribeToObjectNotificationsParams
): Effect.Effect<SubscriptionTarget, HulyClientError | HulyError, HulyClient> =>
  Effect.gen(function* () {
    const objectId = toRef<Doc>(params.objectId)
    const objectClass = toClassRef<Doc>(params.objectClass)
    if (params.space !== undefined) {
      return { objectId, objectClass, space: toRef<Space>(params.space) }
    }

    const doc = yield* (yield* HulyClient).findOne<Doc>(objectClass, hulyQuery<Doc>({ _id: objectId }))
    if (doc === undefined) {
      return yield* new HulyError({ message: `Object '${params.objectId}' of class '${params.objectClass}' not found` })
    }
    return { objectId, objectClass, space: doc.space }
  })

export const subscribeToObjectNotifications = (
  params: SubscribeToObjectNotificationsParams
): Effect.Effect<ObjectNotificationSubscriptionResult, ObjectNotificationSubscriptionError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const target = yield* resolveSubscriptionTarget(params)
    const accountUuid = client.getAccountUuid()

    const existing = yield* client.findOne<HulyCollaborator>(
      core.class.Collaborator,
      hulyQuery<HulyCollaborator>({
        attachedTo: target.objectId,
        attachedToClass: target.objectClass,
        collaborator: accountUuid
      })
    )

    if (existing !== undefined) {
      return {
        objectId: DocId.make(target.objectId),
        objectClass: ObjectClassName.make(target.objectClass),
        subscribed: true,
        changed: false
      }
    }

    yield* client.addCollection(
      core.class.Collaborator,
      target.space,
      target.objectId,
      target.objectClass,
      "collaborators",
      { collaborator: accountUuid },
      generateId<HulyCollaborator>()
    )

    return {
      objectId: DocId.make(target.objectId),
      objectClass: ObjectClassName.make(target.objectClass),
      subscribed: true,
      changed: true
    }
  })

export const unsubscribeFromObjectNotifications = (
  params: UnsubscribeFromObjectNotificationsParams
): Effect.Effect<ObjectNotificationSubscriptionResult, ObjectNotificationSubscriptionError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const target = yield* resolveSubscriptionTarget(params)
    const accountUuid = client.getAccountUuid()

    const existing = yield* client.findOne<HulyCollaborator>(
      core.class.Collaborator,
      hulyQuery<HulyCollaborator>({
        attachedTo: target.objectId,
        attachedToClass: target.objectClass,
        collaborator: accountUuid
      })
    )

    if (existing === undefined) {
      return {
        objectId: DocId.make(target.objectId),
        objectClass: ObjectClassName.make(target.objectClass),
        subscribed: false,
        changed: false
      }
    }

    if (client.removeCollection === undefined) {
      return yield* new HulyError({ message: "Huly client does not support removeCollection" })
    }

    yield* client.removeCollection(
      core.class.Collaborator,
      existing.space,
      existing._id,
      target.objectId,
      target.objectClass,
      "collaborators"
    )

    return {
      objectId: DocId.make(target.objectId),
      objectClass: ObjectClassName.make(target.objectClass),
      subscribed: false,
      changed: true
    }
  })
