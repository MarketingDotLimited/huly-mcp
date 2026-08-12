import { Schema } from "effect"

import { toDraft07JsonSchema } from "./json-schema.js"

import { ActivityMarkdown, ActivityMarkup, MentionContent } from "./domain-values.js"
import {
  ActivityMessageId,
  ChannelIdentifier,
  Count,
  DEFAULT_LIMIT,
  DocId,
  DocumentIdentifier,
  EmojiCode,
  hasAllDefined,
  IssueIdentifier,
  LimitParam,
  MAX_LIMIT,
  MentionId,
  ObjectClassName,
  PersonId,
  ProjectIdentifier,
  ReactionId,
  SavedMessageId,
  TeamspaceIdentifier,
  Timestamp
} from "./shared.js"

export const ActivityCount = Count.pipe(Schema.brand("ActivityCount")).annotate({
  identifier: "ActivityCount",
  title: "ActivityCount",
  description: "Non-negative integer count for activity replies or reactions"
})
export type ActivityCount = Schema.Schema.Type<typeof ActivityCount>

export const ActivityActionSchema = Schema.Literals(["create", "update", "remove"])
export const ActivityMessageSchema = Schema.Struct({
  id: ActivityMessageId,
  messageClass: Schema.optional(ObjectClassName),
  objectId: DocId,
  objectClass: ObjectClassName,
  modifiedBy: Schema.optional(PersonId),
  modifiedOn: Schema.optional(Timestamp),
  isPinned: Schema.optional(Schema.Boolean),
  replies: Schema.optional(ActivityCount),
  reactions: Schema.optional(ActivityCount),
  editedOn: Schema.optional(Schema.Union([Timestamp, Schema.Null])),
  action: Schema.optional(ActivityActionSchema),
  message: Schema.optional(ActivityMarkup),
  body: Schema.optional(ActivityMarkdown),
  srcDocId: Schema.optional(DocId),
  srcDocClass: Schema.optional(ObjectClassName),
  attachedDocId: Schema.optional(DocId),
  attachedDocClass: Schema.optional(ObjectClassName)
}).annotate({
  title: "ActivityMessage",
  description:
    "Stable activity projection. id, objectId, and objectClass are required; optional actor, message, class, and metadata fields are omitted when Huly leaves them absent or null. editedOn may explicitly be null."
})
export type ActivityMessage = Schema.Schema.Type<typeof ActivityMessageSchema>
export const ReactionSchema = Schema.Struct({
  id: ReactionId,
  messageId: ActivityMessageId,
  emoji: EmojiCode,
  createdBy: Schema.optional(PersonId)
})
export type Reaction = Schema.Schema.Type<typeof ReactionSchema>
export const SavedMessageSchema = Schema.Struct({ id: SavedMessageId, messageId: ActivityMessageId })
export type SavedMessage = Schema.Schema.Type<typeof SavedMessageSchema>
export const MentionSchema = Schema.Struct({
  id: MentionId,
  messageId: ActivityMessageId,
  userId: PersonId,
  content: Schema.optional(MentionContent)
})
export type Mention = Schema.Schema.Type<typeof MentionSchema>

export const ListActivityParamsSchema = Schema.Struct({
  objectId: Schema.optional(
    DocId.annotate({
      description:
        "Advanced: internal Huly object ID to get activity for. Use with objectClass. Prefer project+issueIdentifier, teamspace+document, or channel when available."
    })
  ),
  objectClass: Schema.optional(
    ObjectClassName.annotate({
      description:
        "Advanced: internal Huly object class for objectId, such as 'tracker:class:Issue'. Use with objectId."
    })
  ),
  project: Schema.optional(
    ProjectIdentifier.annotate({
      description: "Project identifier for issue activity, e.g. 'HULY'. Use with issueIdentifier."
    })
  ),
  issueIdentifier: Schema.optional(
    IssueIdentifier.annotate({
      description: "Issue identifier for issue activity, e.g. 'HULY-123' or '123'. Use with project."
    })
  ),
  teamspace: Schema.optional(
    TeamspaceIdentifier.annotate({ description: "Teamspace name or ID for document activity. Use with document." })
  ),
  document: Schema.optional(
    DocumentIdentifier.annotate({ description: "Document title or ID for document activity. Use with teamspace." })
  ),
  channel: Schema.optional(ChannelIdentifier.annotate({ description: "Channel name or ID for channel activity." })),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of activity messages to return (default: ${DEFAULT_LIMIT})` })
  )
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) => {
        const rawObjectMode = hasAllDefined(params.objectId, params.objectClass)
        const issueMode = hasAllDefined(params.project, params.issueIdentifier)
        const documentMode = hasAllDefined(params.teamspace, params.document)
        const channelMode = params.channel !== undefined
        const modeCount = [rawObjectMode, issueMode, documentMode, channelMode].filter(Boolean).length

        if ((params.objectId !== undefined) !== (params.objectClass !== undefined)) {
          return "Provide both objectId and objectClass for raw object activity, or use a friendly target mode."
        }
        if ((params.project !== undefined) !== (params.issueIdentifier !== undefined)) {
          return "Provide both project and issueIdentifier for issue activity."
        }
        if ((params.teamspace !== undefined) !== (params.document !== undefined)) {
          return "Provide both teamspace and document for document activity."
        }
        if (modeCount !== 1) {
          return "Choose exactly one activity target mode: objectId+objectClass, project+issueIdentifier, teamspace+document, or channel."
        }
        return undefined
      })
    )
  )
  .annotate({
    title: "ListActivityParams",
    description:
      "Parameters for listing activity on a Huly object. Prefer friendly identifiers; raw objectId+objectClass is for advanced callers."
  })

export type ListActivityParams = Schema.Schema.Type<typeof ListActivityParamsSchema>

export const AddReactionParamsSchema = Schema.Struct({
  messageId: ActivityMessageId.annotate({ description: "ID of the activity message to react to" }),
  emoji: EmojiCode.annotate({ description: "Emoji to add (e.g., ':thumbsup:', ':heart:', or unicode emoji)" })
}).annotate({ title: "AddReactionParams", description: "Parameters for adding a reaction to a message" })

export type AddReactionParams = Schema.Schema.Type<typeof AddReactionParamsSchema>

export const RemoveReactionParamsSchema = Schema.Struct({
  messageId: ActivityMessageId.annotate({ description: "ID of the activity message" }),
  emoji: EmojiCode.annotate({ description: "Emoji to remove" })
}).annotate({ title: "RemoveReactionParams", description: "Parameters for removing a reaction from a message" })

export type RemoveReactionParams = Schema.Schema.Type<typeof RemoveReactionParamsSchema>

export const ListReactionsParamsSchema = Schema.Struct({
  messageId: ActivityMessageId.annotate({ description: "ID of the activity message to list reactions for" }),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of reactions to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({ title: "ListReactionsParams", description: "Parameters for listing reactions on a message" })

export type ListReactionsParams = Schema.Schema.Type<typeof ListReactionsParamsSchema>

export const SaveMessageParamsSchema = Schema.Struct({
  messageId: ActivityMessageId.annotate({ description: "ID of the activity message to save/bookmark" })
}).annotate({ title: "SaveMessageParams", description: "Parameters for saving/bookmarking a message" })

export type SaveMessageParams = Schema.Schema.Type<typeof SaveMessageParamsSchema>

export const UnsaveMessageParamsSchema = Schema.Struct({
  messageId: ActivityMessageId.annotate({ description: "ID of the saved activity message to remove from bookmarks" })
}).annotate({ title: "UnsaveMessageParams", description: "Parameters for removing a message from bookmarks" })

export type UnsaveMessageParams = Schema.Schema.Type<typeof UnsaveMessageParamsSchema>

export const ListSavedMessagesParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of saved messages to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({ title: "ListSavedMessagesParams", description: "Parameters for listing saved/bookmarked messages" })

export type ListSavedMessagesParams = Schema.Schema.Type<typeof ListSavedMessagesParamsSchema>

export const ListMentionsParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of mentions to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({ title: "ListMentionsParams", description: "Parameters for listing mentions of the current user" })

export type ListMentionsParams = Schema.Schema.Type<typeof ListMentionsParamsSchema>

const activityLimitJsonSchema = {
  type: "integer",
  minimum: 1,
  maximum: MAX_LIMIT,
  description: `Maximum number of activity messages to return (default: ${DEFAULT_LIMIT})`
}

const targetStringJsonSchema = (description: string): object => ({ type: "string", minLength: 1, description })

export const listActivityParamsJsonSchema = {
  type: "object",
  description:
    "Choose exactly one target mode for activity lookup: project+issueIdentifier, teamspace+document, channel, or objectId+objectClass.",
  oneOf: [
    {
      title: "Issue activity target",
      type: "object",
      additionalProperties: false,
      required: ["project", "issueIdentifier"],
      properties: {
        project: targetStringJsonSchema("Project identifier for issue activity, e.g. 'HULY'."),
        issueIdentifier: targetStringJsonSchema("Issue identifier for issue activity, e.g. 'HULY-123' or '123'."),
        limit: activityLimitJsonSchema
      }
    },
    {
      title: "Document activity target",
      type: "object",
      additionalProperties: false,
      required: ["teamspace", "document"],
      properties: {
        teamspace: targetStringJsonSchema("Teamspace name or ID for document activity."),
        document: targetStringJsonSchema("Document title or ID for document activity."),
        limit: activityLimitJsonSchema
      }
    },
    {
      title: "Channel activity target",
      type: "object",
      additionalProperties: false,
      required: ["channel"],
      properties: {
        channel: targetStringJsonSchema("Channel name or ID for channel activity."),
        limit: activityLimitJsonSchema
      }
    },
    {
      title: "Raw Huly object activity target",
      type: "object",
      additionalProperties: false,
      required: ["objectId", "objectClass"],
      properties: {
        objectId: targetStringJsonSchema("Internal Huly object ID to get activity for."),
        objectClass: targetStringJsonSchema("Internal Huly object class for objectId, such as 'tracker:class:Issue'."),
        limit: activityLimitJsonSchema
      }
    }
  ]
}
export const addReactionParamsJsonSchema = toDraft07JsonSchema(AddReactionParamsSchema)
export const removeReactionParamsJsonSchema = toDraft07JsonSchema(RemoveReactionParamsSchema)
export const listReactionsParamsJsonSchema = toDraft07JsonSchema(ListReactionsParamsSchema)
export const saveMessageParamsJsonSchema = toDraft07JsonSchema(SaveMessageParamsSchema)
export const unsaveMessageParamsJsonSchema = toDraft07JsonSchema(UnsaveMessageParamsSchema)
export const listSavedMessagesParamsJsonSchema = toDraft07JsonSchema(ListSavedMessagesParamsSchema)
export const listMentionsParamsJsonSchema = toDraft07JsonSchema(ListMentionsParamsSchema)

export const parseListActivityParams = Schema.decodeUnknownEffect(ListActivityParamsSchema)
export const parseAddReactionParams = Schema.decodeUnknownEffect(AddReactionParamsSchema)
export const parseRemoveReactionParams = Schema.decodeUnknownEffect(RemoveReactionParamsSchema)
export const parseListReactionsParams = Schema.decodeUnknownEffect(ListReactionsParamsSchema)
export const parseSaveMessageParams = Schema.decodeUnknownEffect(SaveMessageParamsSchema)
export const parseUnsaveMessageParams = Schema.decodeUnknownEffect(UnsaveMessageParamsSchema)
export const parseListSavedMessagesParams = Schema.decodeUnknownEffect(ListSavedMessagesParamsSchema)
export const parseListMentionsParams = Schema.decodeUnknownEffect(ListMentionsParamsSchema)

export const ActivityMessageWireSchema = ActivityMessageSchema

export const ReactionWireSchema = Schema.Struct({
  id: ReactionId,
  messageId: ActivityMessageId,
  emoji: EmojiCode,
  createdBy: Schema.optional(PersonId)
})

export const SavedMessageWireSchema = Schema.Struct({ id: SavedMessageId, messageId: ActivityMessageId })

export const MentionWireSchema = Schema.Struct({
  id: MentionId,
  messageId: ActivityMessageId,
  userId: PersonId,
  content: Schema.optional(MentionContent)
})

export const AddReactionResultSchema = Schema.Struct({ reactionId: ReactionId, messageId: ActivityMessageId })
export type AddReactionResult = Schema.Schema.Type<typeof AddReactionResultSchema>

export const RemoveReactionResultSchema = Schema.Struct({ messageId: ActivityMessageId, removed: Schema.Boolean })
export type RemoveReactionResult = Schema.Schema.Type<typeof RemoveReactionResultSchema>

export const SaveMessageResultSchema = Schema.Struct({ savedId: SavedMessageId, messageId: ActivityMessageId })
export type SaveMessageResult = Schema.Schema.Type<typeof SaveMessageResultSchema>

export const UnsaveMessageResultSchema = Schema.Struct({ messageId: ActivityMessageId, removed: Schema.Boolean })
export type UnsaveMessageResult = Schema.Schema.Type<typeof UnsaveMessageResultSchema>

export const ListActivityResultSchema = Schema.Array(ActivityMessageWireSchema)
export const ListReactionsResultSchema = Schema.Array(ReactionWireSchema)
export const ListSavedMessagesResultSchema = Schema.Array(SavedMessageWireSchema)
export const ListMentionsResultSchema = Schema.Array(MentionWireSchema)
