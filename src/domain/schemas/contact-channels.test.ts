import { Effect, Result, Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  AddPersonChannelParamsSchema,
  AddOrganizationChannelParamsSchema,
  addPersonChannelParamsJsonSchema,
  ContactChannelProviderSchema,
  ContactChannelProviderValues,
  parseAddPersonChannelParams,
  parseRemoveOrganizationChannelParams,
  parseRemovePersonChannelParams,
  parseUpdatePersonChannelParams,
  parseUpdateOrganizationChannelParams,
  RemovePersonChannelParamsSchema,
  UpdatePersonChannelParamsSchema
} from "./contact-channels.js"

describe("Contact Channel Schemas", () => {
  it("preserves LLM-facing property descriptions in the public schema", () => {
    const properties = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(
      Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(addPersonChannelParamsJsonSchema)
        .properties
    )
    const person = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(properties.person)
    expect(person.description).toContain("Person ID")
  })

  describe("ContactChannelProviderSchema", () => {
    it("accepts every supported provider label", () => {
      for (const provider of ContactChannelProviderValues) {
        expect(Schema.decodeUnknownSync(ContactChannelProviderSchema)(provider)).toBe(provider)
      }
    })

    it("rejects unsupported provider labels", () => {
      const result = Schema.decodeUnknownResult(ContactChannelProviderSchema)("fax")
      expect(Result.isFailure(result)).toBe(true)
    })
  })

  describe("AddPersonChannelParamsSchema", () => {
    it("accepts a non-email provider with a non-empty value", () => {
      const result = Schema.decodeUnknownSync(AddPersonChannelParamsSchema)({
        person: "person-1",
        provider: "github",
        value: "octocat"
      })

      expect(result).toEqual({ person: "person-1", provider: "github", value: "octocat" })
    })

    it("rejects empty values", () => {
      const result = Effect.runSync(
        Effect.result(parseAddPersonChannelParams({ person: "person-1", provider: "phone", value: "" }))
      )
      expect(Result.isFailure(result)).toBe(true)
    })

    it("rejects invalid email provider values", () => {
      const result = Effect.runSync(
        Effect.result(parseAddPersonChannelParams({ person: "person-1", provider: "email", value: "not-email" }))
      )
      expect(Result.isFailure(result)).toBe(true)
    })
  })

  describe("UpdatePersonChannelParamsSchema", () => {
    it("requires at least one replacement field", () => {
      const result = Schema.decodeUnknownResult(UpdatePersonChannelParamsSchema)({
        person: "person-1",
        channelId: "channel-1"
      })
      expect(Result.isFailure(result)).toBe(true)
    })

    it("accepts channelId locator with newValue", () => {
      const result = Schema.decodeUnknownSync(UpdatePersonChannelParamsSchema)({
        person: "person-1",
        channelId: "channel-1",
        newValue: "+15551234"
      })
      expect(result).toEqual({ person: "person-1", channelId: "channel-1", newValue: "+15551234" })
    })

    it("accepts provider plus value locator with newProvider", () => {
      const result = Schema.decodeUnknownSync(UpdatePersonChannelParamsSchema)({
        person: "person-1",
        provider: "phone",
        value: "+15551234",
        newProvider: "telegram"
      })
      expect(result).toEqual({ person: "person-1", provider: "phone", value: "+15551234", newProvider: "telegram" })
    })

    it("rejects missing and mixed locators", () => {
      const missing = Effect.runSync(
        Effect.result(parseUpdatePersonChannelParams({ person: "person-1", newValue: "x" }))
      )
      const mixed = Effect.runSync(
        Effect.result(
          parseUpdatePersonChannelParams({
            person: "person-1",
            channelId: "channel-1",
            provider: "phone",
            newValue: "x"
          })
        )
      )
      const incomplete = Effect.runSync(
        Effect.result(parseUpdatePersonChannelParams({ person: "person-1", provider: "phone", newValue: "x" }))
      )

      expect(Result.isFailure(missing)).toBe(true)
      expect(Result.isFailure(mixed)).toBe(true)
      expect(Result.isFailure(incomplete)).toBe(true)
    })

    it("rejects invalid target email values", () => {
      const result = Effect.runSync(
        Effect.result(
          parseUpdatePersonChannelParams({
            person: "person-1",
            channelId: "channel-1",
            newProvider: "email",
            newValue: "not-email"
          })
        )
      )
      expect(Result.isFailure(result)).toBe(true)
    })
  })

  describe("RemovePersonChannelParamsSchema", () => {
    it("accepts exactly one locator shape", () => {
      expect(
        Schema.decodeUnknownSync(RemovePersonChannelParamsSchema)({ person: "person-1", channelId: "channel-1" })
      ).toEqual({ person: "person-1", channelId: "channel-1" })

      expect(
        Schema.decodeUnknownSync(RemovePersonChannelParamsSchema)({
          person: "person-1",
          provider: "homepage",
          value: "https://example.com"
        })
      ).toEqual({ person: "person-1", provider: "homepage", value: "https://example.com" })
    })

    it("rejects neither locator and both locator shapes", () => {
      const neither = Effect.runSync(Effect.result(parseRemovePersonChannelParams({ person: "person-1" })))
      const both = Effect.runSync(
        Effect.result(
          parseRemovePersonChannelParams({
            person: "person-1",
            channelId: "channel-1",
            provider: "homepage",
            value: "https://example.com"
          })
        )
      )

      expect(Result.isFailure(neither)).toBe(true)
      expect(Result.isFailure(both)).toBe(true)
    })
  })

  describe("Organization channel schemas", () => {
    it("accepts valid organization channel values", () => {
      expect(
        Schema.decodeUnknownSync(AddOrganizationChannelParamsSchema)({
          organizationId: "org-1",
          provider: "email",
          value: "owner@example.com"
        })
      ).toEqual({ organizationId: "org-1", provider: "email", value: "owner@example.com" })
    })

    it("checks organization update locators and replacement email values", () => {
      const valid = Effect.runSync(
        parseUpdateOrganizationChannelParams({
          organizationId: "org-1",
          provider: "phone",
          value: "+15551234",
          newProvider: "email",
          newValue: "owner@example.com"
        })
      )
      const invalidExistingEmail = Effect.runSync(
        Effect.result(
          parseUpdateOrganizationChannelParams({
            organizationId: "org-1",
            provider: "email",
            value: "invalid",
            newValue: "owner@example.com"
          })
        )
      )
      const incomplete = Effect.runSync(
        Effect.result(
          parseUpdateOrganizationChannelParams({ organizationId: "org-1", provider: "phone", newValue: "+15551234" })
        )
      )

      expect(valid.newValue).toBe("owner@example.com")
      expect(Result.isFailure(invalidExistingEmail)).toBe(true)
      expect(Result.isFailure(incomplete)).toBe(true)
    })

    it("checks organization removal locators and provider values", () => {
      const valid = Effect.runSync(
        parseRemoveOrganizationChannelParams({ organizationId: "org-1", provider: "email", value: "owner@example.com" })
      )
      const incomplete = Effect.runSync(
        Effect.result(parseRemoveOrganizationChannelParams({ organizationId: "org-1", provider: "phone" }))
      )
      const invalidEmail = Effect.runSync(
        Effect.result(
          parseRemoveOrganizationChannelParams({ organizationId: "org-1", provider: "email", value: "invalid" })
        )
      )

      expect(valid.value).toBe("owner@example.com")
      expect(Result.isFailure(incomplete)).toBe(true)
      expect(Result.isFailure(invalidEmail)).toBe(true)
    })
  })
})
