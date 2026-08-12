import { Schema } from "effect"

import { toDraft07JsonSchema } from "./json-schema.js"

import { ActivityMessageWireSchema } from "./activity.js"
import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "./document-native-references.js"
import { ActivityFilterPosition, ActivityMarkup, DisplayText } from "./domain-values.js"
import {
  ActivityFilterId,
  ActivityMessageId,
  ActivityReferenceId,
  DEFAULT_LIMIT,
  DocId,
  LimitParam,
  ObjectClassName,
  Timestamp
} from "./shared.js"
export const ActivityFilterSchema = Schema.Struct({
  id: ActivityFilterId,
  label: Schema.optional(DisplayText),
  position: ActivityFilterPosition
})
export type ActivityFilter = Schema.Schema.Type<typeof ActivityFilterSchema>
export const ActivityReferenceSchema = Schema.Struct({
  id: ActivityReferenceId,
  messageId: ActivityMessageId,
  srcDocId: DocId,
  srcDocClass: ObjectClassName,
  attachedDocId: Schema.optional(DocId),
  attachedDocClass: Schema.optional(ObjectClassName),
  message: ActivityMarkup,
  modifiedOn: Schema.optional(Timestamp)
})
export type ActivityReference = Schema.Schema.Type<typeof ActivityReferenceSchema>

export const GetActivityMessageParamsSchema = Schema.Struct({
  messageId: ActivityMessageId.annotate({ description: "ID of the activity message to retrieve." })
}).annotate({
  title: "GetActivityMessageParams",
  description: "Parameters for retrieving a single activity message by ID."
})

export type GetActivityMessageParams = Schema.Schema.Type<typeof GetActivityMessageParamsSchema>

export const PinActivityMessageParamsSchema = Schema.Struct({
  messageId: ActivityMessageId.annotate({ description: "ID of the activity message to pin or unpin." }),
  pinned: Schema.Boolean.annotate({ description: "Whether the activity message should be pinned." })
}).annotate({
  title: "PinActivityMessageParams",
  description:
    "Parameters for pinning or unpinning an activity message. Idempotent when already in the requested state."
})

export type PinActivityMessageParams = Schema.Schema.Type<typeof PinActivityMessageParamsSchema>

export const ListActivityFiltersParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of activity filters to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({ title: "ListActivityFiltersParams", description: "Parameters for listing configured activity filters." })

export type ListActivityFiltersParams = Schema.Schema.Type<typeof ListActivityFiltersParamsSchema>

export const ListActivityReferencesParamsSchema = Schema.Struct({
  objectId: DocId.annotate({ description: "Internal Huly object ID to list activity references for." }),
  objectClass: ObjectClassName.annotate({ description: "Internal Huly object class to list activity references for." }),
  direction: Schema.optional(
    Schema.Literals(["from", "to", "both"]).annotate({
      description:
        "Reference direction. 'from' lists references created by this object, 'to' lists references pointing at this object, 'both' lists either direction (default: both)."
    })
  ),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of activity references to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({
  title: "ListActivityReferencesParams",
  description: "Parameters for listing activity references connected to a raw Huly object."
})

export type ListActivityReferencesParams = Schema.Schema.Type<typeof ListActivityReferencesParamsSchema>

export const ListActivityRepliesParamsSchema = Schema.Struct({
  messageId: ActivityMessageId.annotate({ description: "ID of the activity message whose replies should be listed." }),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of replies to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({
  title: "ListActivityRepliesParams",
  description: "Parameters for listing thread replies on any activity message."
})

export type ListActivityRepliesParams = Schema.Schema.Type<typeof ListActivityRepliesParamsSchema>

// Reply bodies are free-form Markdown authored by users, not identities or closed
// domain values, so the schema uses the primitive non-empty string validator.
export const AddActivityReplyParamsSchema = Schema.Struct({
  messageId: ActivityMessageId.annotate({ description: "ID of the activity message to reply to." }),
  body: Schema.NonEmptyString.annotate({
    description: `Reply body in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
  })
}).annotate({ title: "AddActivityReplyParams", description: "Parameters for adding a reply to any activity message." })

export type AddActivityReplyParams = Schema.Schema.Type<typeof AddActivityReplyParamsSchema>

export const UpdateActivityReplyParamsSchema = Schema.Struct({
  replyId: ActivityMessageId.annotate({ description: "ID of the reply activity message to update." }),
  body: Schema.NonEmptyString.annotate({
    description: `New reply body in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
  })
}).annotate({ title: "UpdateActivityReplyParams", description: "Parameters for updating an activity reply." })

export type UpdateActivityReplyParams = Schema.Schema.Type<typeof UpdateActivityReplyParamsSchema>

export const DeleteActivityReplyParamsSchema = Schema.Struct({
  replyId: ActivityMessageId.annotate({ description: "ID of the reply activity message to delete." })
}).annotate({ title: "DeleteActivityReplyParams", description: "Parameters for deleting an activity reply." })

export type DeleteActivityReplyParams = Schema.Schema.Type<typeof DeleteActivityReplyParamsSchema>

export const getActivityMessageParamsJsonSchema = toDraft07JsonSchema(GetActivityMessageParamsSchema)
export const pinActivityMessageParamsJsonSchema = toDraft07JsonSchema(PinActivityMessageParamsSchema)
export const listActivityFiltersParamsJsonSchema = toDraft07JsonSchema(ListActivityFiltersParamsSchema)
export const listActivityReferencesParamsJsonSchema = toDraft07JsonSchema(ListActivityReferencesParamsSchema)
export const listActivityRepliesParamsJsonSchema = toDraft07JsonSchema(ListActivityRepliesParamsSchema)
export const addActivityReplyParamsJsonSchema = toDraft07JsonSchema(AddActivityReplyParamsSchema)
export const updateActivityReplyParamsJsonSchema = toDraft07JsonSchema(UpdateActivityReplyParamsSchema)
export const deleteActivityReplyParamsJsonSchema = toDraft07JsonSchema(DeleteActivityReplyParamsSchema)

export const parseGetActivityMessageParams = Schema.decodeUnknownEffect(GetActivityMessageParamsSchema)
export const parsePinActivityMessageParams = Schema.decodeUnknownEffect(PinActivityMessageParamsSchema)
export const parseListActivityFiltersParams = Schema.decodeUnknownEffect(ListActivityFiltersParamsSchema)
export const parseListActivityReferencesParams = Schema.decodeUnknownEffect(ListActivityReferencesParamsSchema)
export const parseListActivityRepliesParams = Schema.decodeUnknownEffect(ListActivityRepliesParamsSchema)
export const parseAddActivityReplyParams = Schema.decodeUnknownEffect(AddActivityReplyParamsSchema)
export const parseUpdateActivityReplyParams = Schema.decodeUnknownEffect(UpdateActivityReplyParamsSchema)
export const parseDeleteActivityReplyParams = Schema.decodeUnknownEffect(DeleteActivityReplyParamsSchema)

export const ActivityFilterWireSchema = Schema.Struct({
  id: ActivityFilterId,
  label: Schema.optional(DisplayText),
  position: ActivityFilterPosition
})

export const ActivityReferenceWireSchema = Schema.Struct({
  id: ActivityReferenceId,
  messageId: ActivityMessageId,
  srcDocId: DocId,
  srcDocClass: ObjectClassName,
  attachedDocId: Schema.optional(DocId),
  attachedDocClass: Schema.optional(ObjectClassName),
  message: ActivityMarkup,
  modifiedOn: Schema.optional(Timestamp)
})

export const PinActivityMessageResultSchema = Schema.Struct({ messageId: ActivityMessageId, pinned: Schema.Boolean })
export type PinActivityMessageResult = Schema.Schema.Type<typeof PinActivityMessageResultSchema>

export const AddActivityReplyResultSchema = Schema.Struct({ replyId: ActivityMessageId, messageId: ActivityMessageId })
export type AddActivityReplyResult = Schema.Schema.Type<typeof AddActivityReplyResultSchema>

export const UpdateActivityReplyResultSchema = Schema.Struct({ replyId: ActivityMessageId, updated: Schema.Boolean })
export type UpdateActivityReplyResult = Schema.Schema.Type<typeof UpdateActivityReplyResultSchema>

export const DeleteActivityReplyResultSchema = Schema.Struct({ replyId: ActivityMessageId, deleted: Schema.Boolean })
export type DeleteActivityReplyResult = Schema.Schema.Type<typeof DeleteActivityReplyResultSchema>

export const GetActivityMessageResultSchema = ActivityMessageWireSchema
export const ListActivityFiltersResultSchema = Schema.Array(ActivityFilterWireSchema)
export const ListActivityReferencesResultSchema = Schema.Array(ActivityReferenceWireSchema)
export const ListActivityRepliesResultSchema = Schema.Array(ActivityMessageWireSchema)
