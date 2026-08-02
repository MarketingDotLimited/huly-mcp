/* eslint-disable no-restricted-syntax -- Huly SDK phantom refs are erased at runtime; these tests build in-memory SDK fixtures. */
import { describe, it } from "@effect/vitest"
import type {
  Channel as HulyChannel,
  ChatMessage,
  DirectMessage as HulyDirectMessage,
  ThreadMessage as HulyThreadMessage
} from "@hcengineering/chunter"
import type { AccountUuid, Doc, DocumentQuery, DocumentUpdate, PersonId, Ref, Space } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import { Effect, Exit } from "effect"
import { expect } from "vitest"

import { HulyClient } from "../../../src/huly/client.js"
import { TranslationLanguage } from "../../../src/domain/schemas/chat-message-workflows.js"
import { chunter } from "../../../src/huly/huly-plugins.js"
import {
  listPinnedChatMessages,
  requestChannelAccess,
  setChatMessagePinned,
  translateChatMessage
} from "../../../src/huly/operations/chat-message-workflows.js"
import { channelIdentifier, directMessageIdentifier, messageBrandId } from "../../helpers/brands.js"

const channel: HulyChannel = {
  _id: "channel-1" as Ref<HulyChannel>,
  _class: chunter.class.Channel,
  space: "channel-1" as Ref<Space>,
  name: "general",
  description: "",
  private: false,
  archived: false,
  members: ["00000000-0000-4000-8000-000000000000" as AccountUuid],
  modifiedBy: "person-1" as PersonId,
  modifiedOn: 1
}

const message: ChatMessage = {
  _id: "message-1" as Ref<ChatMessage>,
  _class: chunter.class.ChatMessage,
  space: channel._id,
  attachedTo: channel._id as Ref<Doc>,
  attachedToClass: chunter.class.Channel,
  collection: "messages",
  message: "<p>Hello</p>",
  isPinned: false,
  modifiedBy: "person-1" as PersonId,
  modifiedOn: 2,
  createdOn: 2
}

const reply: HulyThreadMessage = {
  ...message,
  _id: "reply-1" as Ref<HulyThreadMessage>,
  _class: chunter.class.ThreadMessage,
  attachedTo: message._id,
  attachedToClass: chunter.class.ChatMessage,
  collection: "replies",
  objectId: channel._id as Ref<Doc>,
  objectClass: chunter.class.Channel,
  message: "<p>Newest reply</p>",
  isPinned: true,
  modifiedOn: 3,
  createdOn: 3
}

const directMessage: HulyDirectMessage = {
  _id: "dm-1" as Ref<HulyDirectMessage>,
  _class: chunter.class.DirectMessage,
  space: "dm-1" as Ref<Space>,
  name: "",
  description: "",
  private: true,
  archived: false,
  members: ["00000000-0000-4000-8000-000000000000" as AccountUuid],
  modifiedBy: "person-1" as PersonId,
  modifiedOn: 1
}

describe("chat message workflows", () => {
  it.effect("pins a channel message through channel and message locators", () =>
    Effect.gen(function* () {
      const updates: Array<DocumentUpdate<ChatMessage>> = []
      const layer = HulyClient.testLayer({
        findOne: <T extends Doc>(_class: unknown, query: DocumentQuery<T>) => {
          if (_class === chunter.class.Channel) return Effect.succeed(channel as unknown as T)
          if (_class === chunter.class.ChatMessage && Reflect.get(query, "_id") === message._id) {
            return Effect.succeed(message as unknown as T)
          }
          return Effect.succeed(undefined)
        },
        updateDoc: <T extends Doc>(_class: unknown, _space: Ref<Space>, _id: Ref<T>, operations: DocumentUpdate<T>) => {
          updates.push(operations as DocumentUpdate<ChatMessage>)
          return Effect.succeed([])
        }
      })

      const result = yield* setChatMessagePinned({
        channel: channelIdentifier("general"),
        messageId: messageBrandId("message-1"),
        pinned: true
      }).pipe(Effect.provide(layer))

      expect(result).toEqual({
        kind: "channel_message",
        conversationId: "channel-1",
        messageId: "message-1",
        pinned: true,
        changed: true
      })
      expect(updates).toEqual([{ isPinned: true }])
    })
  )

  it.effect("rejects a message locator that does not belong to the resolved channel", () =>
    Effect.gen(function* () {
      const layer = HulyClient.testLayer({
        findOne: <T extends Doc>(_class: unknown) =>
          _class === chunter.class.Channel ? Effect.succeed(channel as unknown as T) : Effect.succeed(undefined)
      })

      const exit = yield* setChatMessagePinned({
        channel: channelIdentifier("general"),
        messageId: messageBrandId("missing"),
        pinned: true
      }).pipe(Effect.provide(layer), Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
    })
  )

  it.effect("is idempotent and pins thread replies through the same locator", () =>
    Effect.gen(function* () {
      const updates: Array<DocumentUpdate<HulyThreadMessage>> = []
      const layer = HulyClient.testLayer({
        findOne: <T extends Doc>(_class: unknown) => {
          if (_class === chunter.class.Channel) return Effect.succeed(channel as unknown as T)
          if (_class === chunter.class.ChatMessage) return Effect.succeed(undefined)
          if (_class === chunter.class.ThreadMessage) return Effect.succeed(reply as unknown as T)
          return Effect.succeed(undefined)
        },
        updateDoc: <T extends Doc>(_class: unknown, _space: Ref<Space>, _id: Ref<T>, operations: DocumentUpdate<T>) => {
          updates.push(operations as unknown as DocumentUpdate<HulyThreadMessage>)
          return Effect.succeed([])
        }
      })

      const pinned = yield* setChatMessagePinned({
        channel: channelIdentifier("general"),
        messageId: messageBrandId("reply-1"),
        pinned: false
      }).pipe(Effect.provide(layer))
      expect(pinned).toMatchObject({ kind: "channel_message", messageId: "reply-1", changed: true })
      expect(updates).toEqual([{ isPinned: false }])

      const { isPinned: _isPinned, ...messageWithoutPin } = message
      const idempotentLayer = HulyClient.testLayer({
        findOne: <T extends Doc>(_class: unknown) =>
          _class === chunter.class.Channel
            ? Effect.succeed(channel as unknown as T)
            : _class === chunter.class.ChatMessage
              ? Effect.succeed(messageWithoutPin as unknown as T)
              : Effect.succeed(undefined),
        updateDoc: () => Effect.die(new Error("idempotent pin must not update"))
      })
      const unchanged = yield* setChatMessagePinned({
        channel: channelIdentifier("general"),
        messageId: messageBrandId("message-1"),
        pinned: false
      }).pipe(Effect.provide(idempotentLayer))
      expect(unchanged.changed).toBe(false)
    })
  )

  it.effect("lists pinned messages and thread replies newest-first through a channel locator", () =>
    Effect.gen(function* () {
      const pinnedMessage = { ...message, isPinned: true }
      const layer = HulyClient.testLayer({
        findOne: <T extends Doc>(_class: unknown) =>
          _class === chunter.class.Channel ? Effect.succeed(channel as unknown as T) : Effect.succeed(undefined),
        findAll: <T extends Doc>(_class: unknown) => {
          if (_class === chunter.class.ChatMessage) {
            return Effect.succeed(toFindResult([pinnedMessage as unknown as T], 1))
          }
          if (_class === chunter.class.ThreadMessage) {
            return Effect.succeed(toFindResult([reply as unknown as T], 1))
          }
          return Effect.succeed(toFindResult([]))
        }
      })

      const result = yield* listPinnedChatMessages({ channel: channelIdentifier("general"), limit: 10 }).pipe(
        Effect.provide(layer)
      )

      expect(result).toEqual({
        kind: "channel",
        conversationId: "channel-1",
        messages: [
          {
            kind: "thread_reply",
            id: "reply-1",
            parentMessageId: "message-1",
            body: "<p>Newest reply</p>",
            senderId: "person-1",
            createdOn: 3
          },
          { kind: "message", id: "message-1", body: "<p>Hello</p>", senderId: "person-1", createdOn: 2 }
        ],
        total: 2
      })
    })
  )

  it.effect("returns explicit unsupported results for request-access and translation flows", () =>
    Effect.gen(function* () {
      const access = yield* requestChannelAccess({ channel: channelIdentifier("private-team") })
      const translation = yield* translateChatMessage({
        channel: channelIdentifier("general"),
        messageId: messageBrandId("message-1"),
        targetLanguage: TranslationLanguage.make("fr-CA")
      })
      const dmTranslation = yield* translateChatMessage({
        dm: directMessageIdentifier("dm-1"),
        messageId: messageBrandId("message-1"),
        targetLanguage: TranslationLanguage.make("de")
      })

      expect(access).toMatchObject({
        supported: false,
        flow: "channel_request_access",
        channel: "private-team",
        reasonCode: "chunter_access_request_unavailable"
      })
      expect(translation).toMatchObject({
        supported: false,
        flow: "chat_message_translation",
        target: { kind: "channel", channel: "general" },
        messageId: "message-1",
        targetLanguage: "fr-CA",
        reasonCode: "server_translation_unavailable"
      })
      expect(dmTranslation.target).toEqual({ kind: "direct_message", dm: "dm-1" })
    })
  )

  it.effect("resolves direct-message locators for pinned-message reads", () =>
    Effect.gen(function* () {
      const layer = HulyClient.testLayer({
        findOne: <T extends Doc>(_class: unknown) =>
          _class === chunter.class.DirectMessage
            ? Effect.succeed(directMessage as unknown as T)
            : Effect.succeed(undefined),
        findAll: () => Effect.succeed(toFindResult([], -1))
      })

      const result = yield* listPinnedChatMessages({ dm: directMessageIdentifier("dm-1"), limit: 1 }).pipe(
        Effect.provide(layer)
      )

      expect(result).toEqual({ kind: "direct_message", conversationId: "dm-1", messages: [], total: -1 })
    })
  )

  it.effect("pins a message through a direct-message locator", () =>
    Effect.gen(function* () {
      const dmMessage: ChatMessage = { ...message, space: directMessage._id, attachedTo: directMessage._id as Ref<Doc> }
      const layer = HulyClient.testLayer({
        findOne: <T extends Doc>(_class: unknown) => {
          if (_class === chunter.class.DirectMessage) return Effect.succeed(directMessage as unknown as T)
          if (_class === chunter.class.ChatMessage) return Effect.succeed(dmMessage as unknown as T)
          return Effect.succeed(undefined)
        },
        updateDoc: () => Effect.succeed([])
      })

      const result = yield* setChatMessagePinned({
        dm: directMessageIdentifier("dm-1"),
        messageId: messageBrandId("message-1"),
        pinned: true
      }).pipe(Effect.provide(layer))

      expect(result).toMatchObject({ kind: "direct_message", conversationId: "dm-1", changed: true })
    })
  )

  it.effect("omits absent timestamps while sorting mixed pinned message kinds", () =>
    Effect.gen(function* () {
      const { createdOn: _messageCreatedOn, ...undatedMessage } = message
      const { createdOn: _replyCreatedOn, ...undatedReply } = reply
      const datedMessage = { ...message, _id: "message-2" as Ref<ChatMessage>, createdOn: 1, isPinned: true }
      const datedReply = { ...reply, _id: "reply-2" as Ref<HulyThreadMessage>, createdOn: 4 }
      const layer = HulyClient.testLayer({
        findOne: <T extends Doc>(_class: unknown) =>
          _class === chunter.class.Channel ? Effect.succeed(channel as unknown as T) : Effect.succeed(undefined),
        findAll: <T extends Doc>(_class: unknown) =>
          _class === chunter.class.ChatMessage
            ? Effect.succeed(toFindResult([undatedMessage as unknown as T, datedMessage as unknown as T], 2))
            : Effect.succeed(toFindResult([undatedReply as unknown as T, datedReply as unknown as T], 2))
      })

      const result = yield* listPinnedChatMessages({ channel: channelIdentifier("general"), limit: 10 }).pipe(
        Effect.provide(layer)
      )

      expect(result.total).toBe(4)
      expect(result.messages.map((item) => item.id)).toEqual(["reply-2", "message-2", "message-1", "reply-1"])
      expect(result.messages.filter((item) => item.createdOn === undefined)).toHaveLength(2)
    })
  )
})
