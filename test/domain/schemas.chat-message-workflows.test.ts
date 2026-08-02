import { describe, it } from "@effect/vitest"
import { Effect, Exit } from "effect"
import { expect } from "vitest"

import {
  parseListPinnedChatMessagesParams,
  parseRequestChannelAccessParams,
  parseSetChatMessagePinnedParams,
  parseTranslateChatMessageParams
} from "../../src/domain/schemas/chat-message-workflows.js"

describe("chat message workflow schemas", () => {
  it.effect("parses locator-backed pin and list inputs", () =>
    Effect.gen(function* () {
      expect(
        yield* parseSetChatMessagePinnedParams({ channel: " general ", messageId: "message-1", pinned: true })
      ).toEqual({ channel: "general", messageId: "message-1", pinned: true })
      expect(yield* parseListPinnedChatMessagesParams({ dm: "dm-1", limit: 20 })).toEqual({ dm: "dm-1", limit: 20 })
    })
  )

  it.effect("rejects missing or conflicting conversation locators", () =>
    Effect.gen(function* () {
      const missing = yield* parseListPinnedChatMessagesParams({}).pipe(Effect.exit)
      const conflicting = yield* parseTranslateChatMessageParams({
        channel: "general",
        dm: "dm-1",
        messageId: "message-1",
        targetLanguage: "fr"
      }).pipe(Effect.exit)

      expect(Exit.isFailure(missing)).toBe(true)
      expect(Exit.isFailure(conflicting)).toBe(true)
    })
  )

  it.effect("parses unsupported-flow locators and rejects blank translation languages", () =>
    Effect.gen(function* () {
      expect(yield* parseRequestChannelAccessParams({ channel: "private-team" })).toEqual({ channel: "private-team" })
      expect(
        yield* parseTranslateChatMessageParams({
          channel: "general",
          messageId: "message-1",
          targetLanguage: " fr-CA "
        })
      ).toEqual({ channel: "general", messageId: "message-1", targetLanguage: "fr-CA" })

      const blankLanguage = yield* parseTranslateChatMessageParams({
        channel: "general",
        messageId: "message-1",
        targetLanguage: "   "
      }).pipe(Effect.exit)
      expect(Exit.isFailure(blankLanguage)).toBe(true)
    })
  )
})
