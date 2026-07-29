import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import { createAccessLinkParamsJsonSchema, parseCreateAccessLinkParams } from "../../src/domain/schemas.js"

describe("workspace schemas", () => {
  it.effect("accepts anonymous access links with second-based validity window", () =>
    Effect.gen(function* () {
      const result = yield* parseCreateAccessLinkParams({
        role: "GUEST",
        spaces: ["space-docs"],
        personalized: false,
        notBefore: 1_700_000_000,
        expiration: 1_700_000_300
      })

      expect(result.personalized).toBe(false)
      expect(result.spaces).toEqual(["space-docs"])
      expect(result.notBefore).toBe(1_700_000_000)
      expect(result.expiration).toBe(1_700_000_300)
    })
  )

  it.effect("rejects anonymous access links without validity bounds", () =>
    Effect.gen(function* () {
      const result = yield* Effect.either(parseCreateAccessLinkParams({ personalized: false }))

      expect(result._tag).toBe("Left")
    })
  )

  it.effect("rejects access links with expiration before notBefore", () =>
    Effect.gen(function* () {
      const result = yield* Effect.either(
        parseCreateAccessLinkParams({ notBefore: 1_700_000_300, expiration: 1_700_000_000 })
      )

      expect(result._tag).toBe("Left")
    })
  )

  it.effect("rejects millisecond timestamps", () =>
    Effect.gen(function* () {
      const result = yield* Effect.either(
        parseCreateAccessLinkParams({
          personalized: false,
          notBefore: 1_546_300_800_000,
          expiration: 1_546_301_100_000
        })
      )

      expect(result._tag).toBe("Left")
    })
  )

  it.effect("documents access-link timestamps as seconds in JSON schema", () =>
    Effect.gen(function* () {
      const schema = JSON.stringify(createAccessLinkParamsJsonSchema)

      expect(schema).toContain("Unix timestamp in seconds")
      expect(schema).toContain(`"maximum":9999999999`)
      expect(schema).not.toContain(`"$ref":"#/$defs/NonNegativeInt"`)
      expect(schema).not.toContain("Unix timestamp in milliseconds")
    })
  )
})
