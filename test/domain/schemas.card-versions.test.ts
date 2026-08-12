import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import {
  CardVersionMetadataSchema,
  ListCardVersionsResultSchema,
  listCardVersionsParamsJsonSchema,
  parseListCardVersionsParams
} from "../../src/domain/schemas/card-versions.js"

describe("card version schemas", () => {
  it.effect("parses branded version values and friendly history locators", () =>
    Effect.gen(function* () {
      const metadata = yield* Schema.decodeUnknownEffect(CardVersionMetadataSchema)({
        number: 2,
        chainId: "card-chain-1",
        isLatest: true
      })
      const params = yield* parseListCardVersionsParams({
        cardSpace: "Default",
        card: "An exact old-version title",
        limit: 3
      })

      expect(metadata.number).toBe(2)
      expect(metadata.chainId).toBe("card-chain-1")
      expect(params.card).toBe("An exact old-version title")
    })
  )

  it.effect("rejects non-positive version numbers and impossible page totals", () =>
    Effect.gen(function* () {
      const zero = yield* Effect.result(
        Schema.decodeUnknownEffect(CardVersionMetadataSchema)({ number: 0, chainId: "chain-1" })
      )
      const impossiblePage = yield* Effect.result(
        Schema.decodeUnknownEffect(ListCardVersionsResultSchema)({
          versions: [
            { id: "card-1", title: "One" },
            { id: "card-2", title: "Two" }
          ],
          total: 1,
          hasMore: false
        })
      )

      expect(zero._tag).toBe("Failure")
      expect(impossiblePage._tag).toBe("Failure")
    })
  )

  it.effect("enforces truthful hasMore values and accepts coherent pages", () =>
    Effect.gen(function* () {
      const missingHasMore = yield* Effect.result(
        Schema.decodeUnknownEffect(ListCardVersionsResultSchema)({
          versions: [{ id: "card-1", title: "One" }],
          total: 2,
          hasMore: false
        })
      )
      const unexpectedHasMore = yield* Effect.result(
        Schema.decodeUnknownEffect(ListCardVersionsResultSchema)({
          versions: [{ id: "card-1", title: "One" }],
          total: 1,
          hasMore: true
        })
      )
      const coherentPage = yield* Schema.decodeUnknownEffect(ListCardVersionsResultSchema)({
        versions: [{ id: "card-1", title: "One" }],
        total: 2,
        hasMore: true
      })

      expect(missingHasMore._tag).toBe("Failure")
      expect(unexpectedHasMore._tag).toBe("Failure")
      expect(coherentPage.hasMore).toBe(true)
    })
  )

  it("preserves public field descriptions", () => {
    expect(JSON.stringify(listCardVersionsParamsJsonSchema)).toContain("Exact card-space name or ID")
    expect(JSON.stringify(listCardVersionsParamsJsonSchema)).toContain("Maximum versions in this page")
  })
})
