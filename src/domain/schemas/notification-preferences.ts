import { Schema } from "effect"

import { toDraft07JsonSchema } from "./json-schema.js"

import { DisplayText, NotificationFieldName, NotificationProviderOrder } from "./domain-values.js"
import {
  Count,
  DEFAULT_LIMIT,
  DocId,
  LimitParam,
  NotificationContextId,
  NotificationProviderId,
  NotificationTypeId,
  NotificationTypeId as NotificationTypeIdSchema,
  NotificationTypeSettingId,
  ObjectClassName
} from "./shared.js"
export const NotificationProviderSchema = Schema.Struct({
  id: NotificationProviderId,
  label: Schema.optional(DisplayText),
  description: Schema.optional(DisplayText),
  defaultEnabled: Schema.Boolean,
  canDisable: Schema.Boolean,
  order: NotificationProviderOrder,
  depends: Schema.optional(NotificationProviderId)
})
export type NotificationProvider = Schema.Schema.Type<typeof NotificationProviderSchema>
export const NotificationTypeSchema = Schema.Struct({
  id: NotificationTypeId,
  label: Schema.optional(DisplayText),
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
})
export type NotificationType = Schema.Schema.Type<typeof NotificationTypeSchema>
export const NotificationTypeSettingSchema = Schema.Struct({
  id: NotificationTypeSettingId,
  providerId: NotificationProviderId,
  typeId: NotificationTypeId,
  enabled: Schema.Boolean
})
export type NotificationTypeSetting = Schema.Schema.Type<typeof NotificationTypeSettingSchema>

export const ListNotificationProvidersParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of providers to return (default: ${DEFAULT_LIMIT})` })
  ),
  includeUnavailable: Schema.optional(
    Schema.Boolean.annotate({
      description: "Include providers that the workspace may not currently expose as configurable settings."
    })
  )
}).annotate({
  title: "ListNotificationProvidersParams",
  description: "Parameters for listing notification providers such as inbox, push, and sound."
})

export type ListNotificationProvidersParams = Schema.Schema.Type<typeof ListNotificationProvidersParamsSchema>

export const ListNotificationTypesParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of notification types to return (default: ${DEFAULT_LIMIT})` })
  ),
  includeHidden: Schema.optional(
    Schema.Boolean.annotate({ description: "Include hidden/internal notification types." })
  ),
  objectClass: Schema.optional(
    ObjectClassName.annotate({ description: "Filter to notification types for this Huly object class." })
  )
}).annotate({ title: "ListNotificationTypesParams", description: "Parameters for listing notification types." })

export type ListNotificationTypesParams = Schema.Schema.Type<typeof ListNotificationTypesParamsSchema>

export const UpdateNotificationTypeSettingParamsSchema = Schema.Struct({
  providerId: NotificationProviderId.annotate({
    description: "Notification provider ID, such as notification:providers:InboxNotificationProvider."
  }),
  typeId: NotificationTypeIdSchema.annotate({ description: "Notification type ID to configure." }),
  enabled: Schema.Boolean.annotate({
    description: "Whether to enable or disable this notification type for the provider."
  })
}).annotate({
  title: "UpdateNotificationTypeSettingParams",
  description:
    "Parameters for updating a provider-specific notification type setting. Creates a setting only when the provider is configurable in this workspace."
})

export type UpdateNotificationTypeSettingParams = Schema.Schema.Type<typeof UpdateNotificationTypeSettingParamsSchema>

export const ArchiveNotificationContextParamsSchema = Schema.Struct({
  contextId: NotificationContextId.annotate({
    description: "Notification context ID whose inbox notifications should be archived."
  })
}).annotate({
  title: "ArchiveNotificationContextParams",
  description: "Parameters for archiving all inbox notifications in a context."
})

export type ArchiveNotificationContextParams = Schema.Schema.Type<typeof ArchiveNotificationContextParamsSchema>

export const UnarchiveNotificationContextParamsSchema = ArchiveNotificationContextParamsSchema.annotate({
  title: "UnarchiveNotificationContextParams",
  description: "Parameters for unarchiving all inbox notifications in a context."
})

export type UnarchiveNotificationContextParams = Schema.Schema.Type<typeof UnarchiveNotificationContextParamsSchema>

const ObjectNotificationSubscriptionParamsSchema = Schema.Struct({
  objectId: DocId.annotate({
    description: "Internal Huly object ID to subscribe/unsubscribe the authenticated account to."
  }),
  objectClass: ObjectClassName.annotate({ description: "Internal Huly object class for objectId." }),
  space: Schema.optional(
    DocId.annotate({
      description: "Optional object space ID. If omitted, the operation reads the object to determine the space."
    })
  )
}).annotate({
  title: "ObjectNotificationSubscriptionParams",
  description: "Parameters for subscribing or unsubscribing the authenticated account to object notifications."
})

export const SubscribeToObjectNotificationsParamsSchema = ObjectNotificationSubscriptionParamsSchema
export type SubscribeToObjectNotificationsParams = Schema.Schema.Type<typeof SubscribeToObjectNotificationsParamsSchema>

export const UnsubscribeFromObjectNotificationsParamsSchema = ObjectNotificationSubscriptionParamsSchema
export type UnsubscribeFromObjectNotificationsParams = Schema.Schema.Type<
  typeof UnsubscribeFromObjectNotificationsParamsSchema
>

export const listNotificationProvidersParamsJsonSchema = toDraft07JsonSchema(ListNotificationProvidersParamsSchema)
export const listNotificationTypesParamsJsonSchema = toDraft07JsonSchema(ListNotificationTypesParamsSchema)
export const updateNotificationTypeSettingParamsJsonSchema = toDraft07JsonSchema(
  UpdateNotificationTypeSettingParamsSchema
)
export const archiveNotificationContextParamsJsonSchema = toDraft07JsonSchema(ArchiveNotificationContextParamsSchema)
export const unarchiveNotificationContextParamsJsonSchema = toDraft07JsonSchema(
  UnarchiveNotificationContextParamsSchema
)
export const subscribeToObjectNotificationsParamsJsonSchema = toDraft07JsonSchema(
  SubscribeToObjectNotificationsParamsSchema
)
export const unsubscribeFromObjectNotificationsParamsJsonSchema = toDraft07JsonSchema(
  UnsubscribeFromObjectNotificationsParamsSchema
)

export const parseListNotificationProvidersParams = Schema.decodeUnknownEffect(ListNotificationProvidersParamsSchema)
export const parseListNotificationTypesParams = Schema.decodeUnknownEffect(ListNotificationTypesParamsSchema)
export const parseUpdateNotificationTypeSettingParams = Schema.decodeUnknownEffect(
  UpdateNotificationTypeSettingParamsSchema
)
export const parseArchiveNotificationContextParams = Schema.decodeUnknownEffect(ArchiveNotificationContextParamsSchema)
export const parseUnarchiveNotificationContextParams = Schema.decodeUnknownEffect(
  UnarchiveNotificationContextParamsSchema
)
export const parseSubscribeToObjectNotificationsParams = Schema.decodeUnknownEffect(
  SubscribeToObjectNotificationsParamsSchema
)
export const parseUnsubscribeFromObjectNotificationsParams = Schema.decodeUnknownEffect(
  UnsubscribeFromObjectNotificationsParamsSchema
)
export const UpdateNotificationTypeSettingResultSchema = Schema.Struct({
  providerId: NotificationProviderId,
  typeId: NotificationTypeId,
  enabled: Schema.Boolean,
  updated: Schema.Boolean,
  created: Schema.Boolean
})
export type UpdateNotificationTypeSettingResult = Schema.Schema.Type<typeof UpdateNotificationTypeSettingResultSchema>
export const ArchiveNotificationContextResultSchema = Schema.Struct({
  contextId: NotificationContextId,
  archived: Schema.Boolean,
  count: Count
})
export type ArchiveNotificationContextResult = Schema.Schema.Type<typeof ArchiveNotificationContextResultSchema>
export const ObjectNotificationSubscriptionResultSchema = Schema.Struct({
  objectId: DocId,
  objectClass: ObjectClassName,
  subscribed: Schema.Boolean,
  changed: Schema.Boolean
})
export type ObjectNotificationSubscriptionResult = Schema.Schema.Type<typeof ObjectNotificationSubscriptionResultSchema>

export const ListNotificationProvidersResultSchema = Schema.Array(NotificationProviderSchema)
export const ListNotificationTypesResultSchema = Schema.Array(NotificationTypeSchema)
export const UnarchiveNotificationContextResultSchema = ArchiveNotificationContextResultSchema
export const SubscribeToObjectNotificationsResultSchema = ObjectNotificationSubscriptionResultSchema
export const UnsubscribeFromObjectNotificationsResultSchema = ObjectNotificationSubscriptionResultSchema
