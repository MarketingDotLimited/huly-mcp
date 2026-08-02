import type { ChatMessage, ThreadMessage as HulyThreadMessage } from "@hcengineering/chunter"
import { type DocumentUpdate, SortingOrder } from "@hcengineering/core"
import { Effect } from "effect"

import type {
  ListPinnedChatMessagesParams,
  ListPinnedChatMessagesResult,
  PinnedChatMessage,
  RequestChannelAccessParams,
  RequestChannelAccessResult,
  SetChatMessagePinnedParams,
  SetChatMessagePinnedResult,
  TranslateChatMessageParams,
  TranslateChatMessageResult,
  TranslationTarget
} from "../../domain/schemas/chat-message-workflows.js"
import { ChannelId, MessageId, PersonId, Timestamp } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type {
  ChannelNotFoundError,
  DirectMessageIdentifierAmbiguousError,
  DirectMessageNotFoundError
} from "../errors.js"
import { MessageNotFoundError } from "../errors.js"
import { chunter } from "../huly-plugins.js"
import { resolveConversation, type ResolvedConversation } from "./chat-contexts.js"
import { combinedListTotal } from "./counts.js"
import { markupToMarkdownString } from "./markup.js"
import { clampLimit, hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

type ChatMessageWorkflowError =
  | HulyClientError
  | ChannelNotFoundError
  | DirectMessageIdentifierAmbiguousError
  | DirectMessageNotFoundError
  | MessageNotFoundError

const findLocatedMessage = (
  client: HulyClient["Type"],
  conversation: ResolvedConversation,
  params: SetChatMessagePinnedParams
): Effect.Effect<ChatMessage | HulyThreadMessage, HulyClientError | MessageNotFoundError> =>
  Effect.gen(function* () {
    const messageId = toRef<ChatMessage>(params.messageId)
    const message = yield* client.findOne<ChatMessage>(
      chunter.class.ChatMessage,
      hulyQuery<ChatMessage>({ _id: messageId, attachedTo: conversation.objectId, space: conversation.objectSpace })
    )
    if (message !== undefined) return message

    const reply = yield* client.findOne<HulyThreadMessage>(
      chunter.class.ThreadMessage,
      hulyQuery<HulyThreadMessage>({
        _id: toRef<HulyThreadMessage>(params.messageId),
        objectId: conversation.objectId,
        space: conversation.objectSpace
      })
    )
    if (reply !== undefined) return reply

    return yield* new MessageNotFoundError({
      messageId: params.messageId,
      channel: ChannelId.make(conversation.objectId)
    })
  })

export const setChatMessagePinned = (
  params: SetChatMessagePinnedParams
): Effect.Effect<SetChatMessagePinnedResult, ChatMessageWorkflowError, HulyClient> =>
  Effect.gen(function* () {
    const conversation = yield* resolveConversation(params)
    const client = yield* HulyClient
    const message = yield* findLocatedMessage(client, conversation, params)
    const changed = (message.isPinned ?? false) !== params.pinned

    if (changed) {
      const operations: DocumentUpdate<ChatMessage | HulyThreadMessage> = { isPinned: params.pinned }
      yield* client.updateDoc(message._class, message.space, message._id, operations)
    }

    return {
      kind: conversation.kind === "channel" ? "channel_message" : "direct_message",
      conversationId: ChannelId.make(conversation.objectId),
      messageId: MessageId.make(message._id),
      pinned: params.pinned,
      changed
    }
  })

const toPinnedMessage = (message: ChatMessage, client: HulyClient["Type"]): PinnedChatMessage => ({
  kind: "message",
  id: MessageId.make(message._id),
  body: markupToMarkdownString(message.message, client.markupUrlConfig),
  senderId: PersonId.make(message.modifiedBy),
  ...(message.createdOn === undefined ? {} : { createdOn: Timestamp.make(message.createdOn) })
})

const toPinnedReply = (reply: HulyThreadMessage, client: HulyClient["Type"]): PinnedChatMessage => ({
  kind: "thread_reply",
  id: MessageId.make(reply._id),
  parentMessageId: MessageId.make(reply.attachedTo),
  body: markupToMarkdownString(reply.message, client.markupUrlConfig),
  senderId: PersonId.make(reply.modifiedBy),
  ...(reply.createdOn === undefined ? {} : { createdOn: Timestamp.make(reply.createdOn) })
})

const newestFirst = (left: PinnedChatMessage, right: PinnedChatMessage): number =>
  (right.createdOn ?? 0) - (left.createdOn ?? 0)

export const listPinnedChatMessages = (
  params: ListPinnedChatMessagesParams
): Effect.Effect<ListPinnedChatMessagesResult, ChatMessageWorkflowError, HulyClient> =>
  Effect.gen(function* () {
    const conversation = yield* resolveConversation(params)
    const client = yield* HulyClient
    const limit = clampLimit(params.limit)
    const messages = yield* client.findAll<ChatMessage>(
      chunter.class.ChatMessage,
      hulyQuery<ChatMessage>({ attachedTo: conversation.objectId, space: conversation.objectSpace, isPinned: true }),
      { limit, sort: { createdOn: SortingOrder.Descending } }
    )
    const replies = yield* client.findAll<HulyThreadMessage>(
      chunter.class.ThreadMessage,
      hulyQuery<HulyThreadMessage>({
        objectId: conversation.objectId,
        space: conversation.objectSpace,
        isPinned: true
      }),
      { limit, sort: { createdOn: SortingOrder.Descending } }
    )
    const pinnedMessages = [
      ...messages.map((message) => toPinnedMessage(message, client)),
      ...replies.map((reply) => toPinnedReply(reply, client))
    ]
      .sort(newestFirst)
      .slice(0, limit)

    return {
      kind: conversation.kind,
      conversationId: ChannelId.make(conversation.objectId),
      messages: pinnedMessages,
      total: combinedListTotal([messages.total, replies.total])
    }
  })

const CHANNEL_ACCESS_REQUEST_UNSUPPORTED_REASON =
  "sdk-model-unavailable: the installed @hcengineering/chunter package and current upstream Chunter source expose channel membership but no request-access document, action, or server API"

export const requestChannelAccess = (params: RequestChannelAccessParams): Effect.Effect<RequestChannelAccessResult> =>
  Effect.succeed({
    supported: false,
    flow: "channel_request_access",
    channel: params.channel,
    reasonCode: "chunter_access_request_unavailable",
    unsupportedReason: CHANNEL_ACCESS_REQUEST_UNSUPPORTED_REASON
  })

const CHAT_TRANSLATION_UNSUPPORTED_REASON =
  "server-api-unavailable: current Huly Chunter translation calls an optional AI endpoint from browser resources and stores translated text only in client-side UI state; the installed SDK exposes no stable server-side translation operation"

export const translateChatMessage = (params: TranslateChatMessageParams): Effect.Effect<TranslateChatMessageResult> =>
  Effect.gen(function* () {
    const target: TranslationTarget =
      params.channel !== undefined
        ? { kind: "channel", channel: params.channel }
        : params.dm !== undefined
          ? { kind: "direct_message", dm: params.dm }
          : /* v8 ignore next -- public schema requires exactly one conversation target. */
            yield* Effect.die(new Error("Conversation target schema allowed neither channel nor dm"))

    return {
      supported: false,
      flow: "chat_message_translation",
      target,
      messageId: params.messageId,
      targetLanguage: params.targetLanguage,
      reasonCode: "server_translation_unavailable",
      unsupportedReason: CHAT_TRANSLATION_UNSUPPORTED_REASON
    }
  })
