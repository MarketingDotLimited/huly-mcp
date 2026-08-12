/**
 * Chat conversation schemas for channel membership, channel lifecycle,
 * group direct-message creation, and per-user conversation state.
 */
import { Schema, Tuple } from "effect"

import { toDraft07JsonSchema } from "./json-schema.js"

import {
  AccountUuid,
  ChannelId,
  ChannelIdentifier,
  DirectMessageIdentifier,
  NotificationContextId,
  PersonName,
  PersonRefInput
} from "./shared.js"

export const GroupDirectMessageMinimumOtherPeople = 2

export const ChannelMemberIdentifier = Schema.Union([AccountUuid, PersonRefInput]).annotate({
  description:
    "Workspace channel member to resolve. Accepts a Huly account UUID directly, an exact email address, or an exact person display name."
})
export type ChannelMemberIdentifier = Schema.Schema.Type<typeof ChannelMemberIdentifier>
export const ChannelMemberSummarySchema = Schema.Struct({ accountUuid: AccountUuid, name: Schema.optional(PersonName) })
export type ChannelMemberSummary = Schema.Schema.Type<typeof ChannelMemberSummarySchema>
export const ListChannelMembersResultSchema = Schema.Struct({
  channelId: ChannelId,
  members: Schema.Array(ChannelMemberSummarySchema)
})
export type ListChannelMembersResult = Schema.Schema.Type<typeof ListChannelMembersResultSchema>
export const ChannelMemberMutationResultSchema = Schema.Struct({
  channelId: ChannelId,
  members: Schema.Array(AccountUuid),
  changed: Schema.Boolean
})
export type ChannelMemberMutationResult = Schema.Schema.Type<typeof ChannelMemberMutationResultSchema>
export const ChannelArchiveResultSchema = Schema.Struct({
  channelId: ChannelId,
  archived: Schema.Boolean,
  changed: Schema.Boolean
})
export type ChannelArchiveResult = Schema.Schema.Type<typeof ChannelArchiveResultSchema>
export const CreateGroupDirectMessageResultSchema = Schema.Struct({
  id: ChannelId,
  created: Schema.Boolean,
  members: Schema.Array(AccountUuid)
})
export type CreateGroupDirectMessageResult = Schema.Schema.Type<typeof CreateGroupDirectMessageResultSchema>

export type ConversationKind = "channel" | "direct_message"
export const ConversationStateResultSchema = Schema.Struct({
  kind: Schema.Literals(["channel", "direct_message"]),
  objectId: ChannelId,
  contextId: NotificationContextId,
  starred: Schema.Boolean,
  closed: Schema.Boolean,
  changed: Schema.Boolean
})
export type ConversationStateResult = Schema.Schema.Type<typeof ConversationStateResultSchema>

export const ListChannelMembersParamsSchema = Schema.Struct({
  channel: ChannelIdentifier.annotate({ description: "Channel name or ID whose members should be listed." })
}).annotate({ title: "ListChannelMembersParams", description: "Parameters for listing channel members." })
export type ListChannelMembersParams = Schema.Schema.Type<typeof ListChannelMembersParamsSchema>

export const ChannelMemberMutationParamsSchema = Schema.Struct({
  channel: ChannelIdentifier.annotate({ description: "Channel name or ID whose members should change." }),
  members: Schema.Array(ChannelMemberIdentifier)
    .pipe(Schema.check(Schema.isMinLength(1)))
    .annotate({
      description:
        "Members to add or remove. Each entry may be an account UUID, exact email address, or exact person display name."
    })
}).annotate({ title: "ChannelMemberMutationParams", description: "Parameters for adding or removing channel members." })
export type ChannelMemberMutationParams = Schema.Schema.Type<typeof ChannelMemberMutationParamsSchema>

export const ChannelLifecycleParamsSchema = Schema.Struct({
  channel: ChannelIdentifier.annotate({ description: "Channel name or ID whose archive state should change." })
}).annotate({ title: "ChannelLifecycleParams", description: "Parameters for archiving or unarchiving a channel." })
export type ChannelLifecycleParams = Schema.Schema.Type<typeof ChannelLifecycleParamsSchema>

export const CreateGroupDirectMessageParamsSchema = Schema.Struct({
  people: Schema.Array(PersonRefInput)
    .pipe(Schema.check(Schema.isMinLength(GroupDirectMessageMinimumOtherPeople)))
    .annotate({
      description:
        "At least two other workspace members to include in a group DM. Each entry accepts an exact email address or exact person display name. The authenticated account is included automatically."
    })
}).annotate({
  title: "CreateGroupDirectMessageParams",
  description: "Parameters for creating or resolving a group direct-message conversation by exact participant set."
})
export type CreateGroupDirectMessageParams = Schema.Schema.Type<typeof CreateGroupDirectMessageParamsSchema>

const ChannelConversationTargetSchema = Schema.Struct({
  channel: ChannelIdentifier.annotate({ description: "Channel name or ID. Provide exactly one of channel or dm." }),
  dm: Schema.optionalKey(Schema.Never)
})
const DirectMessageConversationTargetSchema = Schema.Struct({
  channel: Schema.optionalKey(Schema.Never),
  dm: DirectMessageIdentifier.annotate({
    description:
      "Direct-message conversation ID, or a one-to-one participant display name. Provide exactly one of channel or dm."
  })
})
export const ConversationTargetSchema = Schema.Union([
  ChannelConversationTargetSchema,
  DirectMessageConversationTargetSchema
])

export const SetConversationStarredParamsSchema = ConversationTargetSchema.mapMembers(
  Tuple.map(
    Schema.fieldsAssign({
      starred: Schema.Boolean.annotate({
        description: "True to star/pin this conversation for the authenticated user, false to unstar it."
      })
    })
  )
).annotate({
  title: "SetConversationStarredParams",
  description:
    "Parameters for setting the authenticated user's starred state for a channel or direct-message conversation."
})

export type ConversationTarget = Schema.Schema.Type<typeof ConversationTargetSchema>
export type SetConversationStarredParams = Schema.Schema.Type<typeof SetConversationStarredParamsSchema>

export const SetConversationClosedParamsSchema = ConversationTargetSchema.mapMembers(
  Tuple.map(
    Schema.fieldsAssign({
      closed: Schema.Boolean.annotate({
        description:
          "True to close/hide this conversation for the authenticated user, false to reopen it. Does not leave channels or remove members."
      })
    })
  )
).annotate({
  title: "SetConversationClosedParams",
  description:
    "Parameters for setting the authenticated user's closed/visible state for a channel or direct-message conversation."
})
export type SetConversationClosedParams = Schema.Schema.Type<typeof SetConversationClosedParamsSchema>

export const listChannelMembersParamsJsonSchema = toDraft07JsonSchema(ListChannelMembersParamsSchema)
export const channelMemberMutationParamsJsonSchema = toDraft07JsonSchema(ChannelMemberMutationParamsSchema)
export const channelLifecycleParamsJsonSchema = toDraft07JsonSchema(ChannelLifecycleParamsSchema)
export const createGroupDirectMessageParamsJsonSchema = toDraft07JsonSchema(CreateGroupDirectMessageParamsSchema)
export const setConversationStarredParamsJsonSchema = toDraft07JsonSchema(SetConversationStarredParamsSchema)
export const setConversationClosedParamsJsonSchema = toDraft07JsonSchema(SetConversationClosedParamsSchema)

export const parseListChannelMembersParams = Schema.decodeUnknownEffect(ListChannelMembersParamsSchema)
export const parseChannelMemberMutationParams = Schema.decodeUnknownEffect(ChannelMemberMutationParamsSchema)
export const parseChannelLifecycleParams = Schema.decodeUnknownEffect(ChannelLifecycleParamsSchema)
export const parseCreateGroupDirectMessageParams = Schema.decodeUnknownEffect(CreateGroupDirectMessageParamsSchema)
export const parseSetConversationStarredParams = Schema.decodeUnknownEffect(SetConversationStarredParamsSchema)
export const parseSetConversationClosedParams = Schema.decodeUnknownEffect(SetConversationClosedParamsSchema)

export const AddChannelMembersResultSchema = ChannelMemberMutationResultSchema
export const RemoveChannelMembersResultSchema = ChannelMemberMutationResultSchema
export const JoinChannelResultSchema = ChannelMemberMutationResultSchema
export const LeaveChannelResultSchema = ChannelMemberMutationResultSchema
export const ArchiveChannelResultSchema = ChannelArchiveResultSchema
export const UnarchiveChannelResultSchema = ChannelArchiveResultSchema
export const SetConversationStarredResultSchema = ConversationStateResultSchema
export const SetConversationClosedResultSchema = ConversationStateResultSchema
