import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import {
  CardVersionMetadataSchema,
  ListCardVersionsResultSchema,
  parseListCardVersionsParams
} from "../../src/domain/schemas.js"

describe("card version schemas", () => {
  it.effect("parses branded version values and friendly history locators", () =>
    Effect.gen(function*() {
      const metadata = yield* Schema.decodeUnknown(CardVersionMetadataSchema)({
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
    }))

  it.effect("rejects non-positive version numbers and impossible page totals", () =>
    Effect.gen(function*() {
      const zero = yield* Effect.either(
        Schema.decodeUnknown(CardVersionMetadataSchema)({ number: 0, chainId: "chain-1" })
      )
      const impossiblePage = yield* Effect.either(
        Schema.decodeUnknown(ListCardVersionsResultSchema)({
          versions: [
            { id: "card-1", title: "One" },
            { id: "card-2", title: "Two" }
          ],
          total: 1,
          hasMore: false
        })
      )

      expect(zero._tag).toBe("Left")
      expect(impossiblePage._tag).toBe("Left")
    }))

  it.effect("enforces truthful hasMore values and accepts coherent pages", () =>
    Effect.gen(function*() {
      const missingHasMore = yield* Effect.either(
        Schema.decodeUnknown(ListCardVersionsResultSchema)({
          versions: [{ id: "card-1", title: "One" }],
          total: 2,
          hasMore: false
        })
      )
      const unexpectedHasMore = yield* Effect.either(
        Schema.decodeUnknown(ListCardVersionsResultSchema)({
          versions: [{ id: "card-1", title: "One" }],
          total: 1,
          hasMore: true
        })
      )
      const coherentPage = yield* Schema.decodeUnknown(ListCardVersionsResultSchema)({
        versions: [{ id: "card-1", title: "One" }],
        total: 2,
        hasMore: true
      })

      expect(missingHasMore._tag).toBe("Left")
      expect(unexpectedHasMore._tag).toBe("Left")
      expect(coherentPage.hasMore).toBe(true)
    }))
})
