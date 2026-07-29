import { describe, it } from "@effect/vitest"
import { Either, Schema } from "effect"
import { expect } from "vitest"

import {
  ChannelMemberMutationParamsSchema,
  CreateGroupDirectMessageParamsSchema,
  SetConversationClosedParamsSchema,
  SetConversationStarredParamsSchema
} from "../../src/domain/schemas.js"

const decodes = <A, I>(schema: Schema.Schema<A, I, never>, input: unknown): boolean =>
  Either.isRight(Schema.decodeUnknownEither(schema)(input))

describe("chat conversation schemas", () => {
  it("accepts channel member identifiers as account UUID, email, and exact person name", () => {
    expect(
      decodes(ChannelMemberMutationParamsSchema, {
        channel: "general",
        members: ["00000000-0000-4000-8000-000000000010", "member@example.com", "Kerr,Shannon"]
      })
    ).toBe(true)
  })

  it("rejects empty channel member mutation input", () => {
    expect(decodes(ChannelMemberMutationParamsSchema, { channel: "general", members: [] })).toBe(false)
  })

  it("requires at least two people for group direct-message creation", () => {
    expect(decodes(CreateGroupDirectMessageParamsSchema, { people: ["one@example.com", "Two,Person"] })).toBe(true)
    expect(decodes(CreateGroupDirectMessageParamsSchema, { people: ["one@example.com"] })).toBe(false)
  })

  it("requires exactly one conversation target for starred state", () => {
    expect(decodes(SetConversationStarredParamsSchema, { channel: "general", starred: true })).toBe(true)
    expect(decodes(SetConversationStarredParamsSchema, { dm: "dm-1", starred: false })).toBe(true)
    expect(decodes(SetConversationStarredParamsSchema, { starred: true })).toBe(false)
    expect(decodes(SetConversationStarredParamsSchema, { channel: "general", dm: "dm-1", starred: true })).toBe(false)
  })

  it("requires exactly one conversation target for closed state", () => {
    expect(decodes(SetConversationClosedParamsSchema, { channel: "general", closed: true })).toBe(true)
    expect(decodes(SetConversationClosedParamsSchema, { dm: "dm-1", closed: false })).toBe(true)
    expect(decodes(SetConversationClosedParamsSchema, { closed: true })).toBe(false)
    expect(decodes(SetConversationClosedParamsSchema, { channel: "general", dm: "dm-1", closed: true })).toBe(false)
  })
})
