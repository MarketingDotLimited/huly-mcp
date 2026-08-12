import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import {
  CreateWorkspaceParamsSchema,
  createAccessLinkParamsJsonSchema,
  parseCreateAccessLinkParams,
  parseCreateWorkspaceParams
} from "../../src/domain/schemas/workspace.js"

describe("workspace schemas", () => {
  it.effect("preserves ordinary optional workspace region and encoded omission", () =>
    Effect.gen(function* () {
      const withExplicitUndefined = yield* parseCreateWorkspaceParams({ name: "Docs", region: undefined })
      const withoutRegion = yield* parseCreateWorkspaceParams({ name: "Docs" })
      const encoded = yield* Schema.encodeUnknownEffect(CreateWorkspaceParamsSchema)(withoutRegion)

      expect(Object.hasOwn(withExplicitUndefined, "region")).toBe(true)
      expect(withExplicitUndefined.region).toBeUndefined()
      expect(Object.hasOwn(encoded, "region")).toBe(false)
    })
  )

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
      const result = yield* Effect.result(parseCreateAccessLinkParams({ personalized: false }))

      expect(result._tag).toBe("Failure")
    })
  )

  it.effect("rejects access links with expiration before notBefore", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        parseCreateAccessLinkParams({ notBefore: 1_700_000_300, expiration: 1_700_000_000 })
      )

      expect(result._tag).toBe("Failure")
    })
  )

  it.effect("rejects millisecond timestamps", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        parseCreateAccessLinkParams({
          personalized: false,
          notBefore: 1_546_300_800_000,
          expiration: 1_546_301_100_000
        })
      )

      expect(result._tag).toBe("Failure")
    })
  )

  it.effect("documents access-link timestamps as seconds in JSON schema", () =>
    Effect.sync(function () {
      const schema = JSON.stringify(createAccessLinkParamsJsonSchema)

      expect(schema).toContain("Unix timestamp in seconds")
      expect(schema).toContain(`"maximum":9999999999`)
      expect(schema).not.toContain(`"$ref":"#/$defs/NonNegativeInt"`)
      expect(schema).not.toContain("Unix timestamp in milliseconds")
    })
  )
})
