import { Schema, Tuple } from "effect"

import { toDraft07JsonSchema } from "./json-schema.js"

import { ConversationTargetSchema } from "./chat-conversations.js"
import {
  ChannelId,
  ChannelIdentifier,
  DEFAULT_LIMIT,
  LimitParam,
  ListTotal,
  DirectMessageIdentifier,
  MessageId,
  NonEmptyString,
  PersonId,
  Timestamp
} from "./shared.js"

export const SetChatMessagePinnedParamsSchema = ConversationTargetSchema.mapMembers(
  Tuple.map(
    Schema.fieldsAssign({
      messageId: MessageId.annotate({ description: "Message or thread-reply ID to pin or unpin." }),
      pinned: Schema.Boolean.annotate({ description: "True to pin the message, false to unpin it." })
    })
  )
).annotate({
  title: "SetChatMessagePinnedParams",
  description: "Pin or unpin a message located within exactly one channel or direct-message conversation."
})
export type SetChatMessagePinnedParams = Schema.Schema.Type<typeof SetChatMessagePinnedParamsSchema>

export const SetChatMessagePinnedResultSchema = Schema.Struct({
  kind: Schema.Literals(["channel_message", "direct_message"]),
  conversationId: ChannelId,
  messageId: MessageId,
  pinned: Schema.Boolean,
  changed: Schema.Boolean
})
export type SetChatMessagePinnedResult = Schema.Schema.Type<typeof SetChatMessagePinnedResultSchema>

export const ListPinnedChatMessagesParamsSchema = ConversationTargetSchema.mapMembers(
  Tuple.map(
    Schema.fieldsAssign({
      limit: Schema.optional(
        LimitParam.annotate({ description: `Maximum pinned messages to return (default: ${DEFAULT_LIMIT}).` })
      )
    })
  )
).annotate({
  title: "ListPinnedChatMessagesParams",
  description: "List pinned messages and pinned thread replies in exactly one channel or direct-message conversation."
})
export type ListPinnedChatMessagesParams = Schema.Schema.Type<typeof ListPinnedChatMessagesParamsSchema>

const PinnedMessageFields = {
  id: MessageId,
  body: Schema.String,
  senderId: PersonId,
  createdOn: Schema.optional(Timestamp)
}
export const PinnedChatMessageSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("message"), ...PinnedMessageFields }),
  Schema.Struct({ kind: Schema.Literal("thread_reply"), parentMessageId: MessageId, ...PinnedMessageFields })
])
export type PinnedChatMessage = Schema.Schema.Type<typeof PinnedChatMessageSchema>

export const ListPinnedChatMessagesResultSchema = Schema.Struct({
  kind: Schema.Literals(["channel", "direct_message"]),
  conversationId: ChannelId,
  messages: Schema.Array(PinnedChatMessageSchema),
  total: ListTotal
})
export type ListPinnedChatMessagesResult = Schema.Schema.Type<typeof ListPinnedChatMessagesResultSchema>

export const RequestChannelAccessParamsSchema = Schema.Struct({
  channel: ChannelIdentifier.annotate({
    description: "Private channel name or ID for which access would be requested."
  })
}).annotate({
  title: "RequestChannelAccessParams",
  description: "Check and attempt the Huly channel request-access workflow when the installed SDK supports it."
})
export type RequestChannelAccessParams = Schema.Schema.Type<typeof RequestChannelAccessParamsSchema>

export const RequestChannelAccessResultSchema = Schema.Struct({
  supported: Schema.Literal(false),
  flow: Schema.Literal("channel_request_access"),
  channel: RequestChannelAccessParamsSchema.fields.channel,
  reasonCode: Schema.Literal("chunter_access_request_unavailable"),
  unsupportedReason: NonEmptyString
})
export type RequestChannelAccessResult = Schema.Schema.Type<typeof RequestChannelAccessResultSchema>

export const TranslationLanguage = NonEmptyString.pipe(Schema.brand("TranslationLanguage")).annotate({
  identifier: "TranslationLanguage",
  title: "TranslationLanguage",
  description: "Requested non-empty translation language value, such as `French`, `fr`, or `fr-CA`."
})
export type TranslationLanguage = Schema.Schema.Type<typeof TranslationLanguage>

export const TranslateChatMessageParamsSchema = ConversationTargetSchema.mapMembers(
  Tuple.map(
    Schema.fieldsAssign({
      messageId: MessageId.annotate({ description: "Message or thread-reply ID to translate." }),
      targetLanguage: TranslationLanguage
    })
  )
).annotate({
  title: "TranslateChatMessageParams",
  description: "Translate a located chat message when a stable server-side Huly translation API is available."
})
export type TranslateChatMessageParams = Schema.Schema.Type<typeof TranslateChatMessageParamsSchema>

export const TranslationTargetSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("channel"), channel: ChannelIdentifier }),
  Schema.Struct({ kind: Schema.Literal("direct_message"), dm: DirectMessageIdentifier })
])
export type TranslationTarget = Schema.Schema.Type<typeof TranslationTargetSchema>

export const TranslateChatMessageResultSchema = Schema.Struct({
  supported: Schema.Literal(false),
  flow: Schema.Literal("chat_message_translation"),
  target: TranslationTargetSchema,
  messageId: MessageId,
  targetLanguage: TranslationLanguage,
  reasonCode: Schema.Literal("server_translation_unavailable"),
  unsupportedReason: NonEmptyString
})
export type TranslateChatMessageResult = Schema.Schema.Type<typeof TranslateChatMessageResultSchema>

export const setChatMessagePinnedParamsJsonSchema = toDraft07JsonSchema(SetChatMessagePinnedParamsSchema)
export const listPinnedChatMessagesParamsJsonSchema = toDraft07JsonSchema(ListPinnedChatMessagesParamsSchema)
export const requestChannelAccessParamsJsonSchema = toDraft07JsonSchema(RequestChannelAccessParamsSchema)
export const translateChatMessageParamsJsonSchema = toDraft07JsonSchema(TranslateChatMessageParamsSchema)
export const parseSetChatMessagePinnedParams = Schema.decodeUnknownEffect(SetChatMessagePinnedParamsSchema)
export const parseListPinnedChatMessagesParams = Schema.decodeUnknownEffect(ListPinnedChatMessagesParamsSchema)
export const parseRequestChannelAccessParams = Schema.decodeUnknownEffect(RequestChannelAccessParamsSchema)
export const parseTranslateChatMessageParams = Schema.decodeUnknownEffect(TranslateChatMessageParamsSchema)
