import { describe, it } from "@effect/vitest"
import { Effect, Either, Schema } from "effect"
import { expect } from "vitest"

import {
  DeleteCardCommentResultSchema,
  parseAddCardCommentParams,
  parseDeleteCardCommentParams,
  parseListCardCommentsParams,
  parseUpdateCardCommentParams
} from "../../src/domain/schemas/card-comments.js"

describe("card comment schemas", () => {
  it.effect("parses friendly card locators and a bounded list limit", () =>
    Effect.gen(function* () {
      const params = yield* parseListCardCommentsParams({
        cardSpace: "Product Strategy",
        card: "Decision Record",
        limit: 25
      })

      expect(params).toEqual({ cardSpace: "Product Strategy", card: "Decision Record", limit: 25 })
    })
  )

  it.effect("requires non-empty markdown bodies for add and update", () =>
    Effect.gen(function* () {
      expect(
        Either.isLeft(
          yield* Effect.either(parseAddCardCommentParams({ cardSpace: "space-1", card: "card-1", body: "" }))
        )
      ).toBe(true)
      expect(
        Either.isLeft(
          yield* Effect.either(
            parseUpdateCardCommentParams({ cardSpace: "space-1", card: "card-1", commentId: "comment-1", body: "" })
          )
        )
      ).toBe(true)
    })
  )

  it.effect("parses add, update, and delete inputs", () =>
    Effect.gen(function* () {
      expect(
        yield* parseAddCardCommentParams({
          cardSpace: "space-1",
          card: "card-1",
          body: "See [decision](https://huly.test/workbench/ws/card/card-2)."
        })
      ).toMatchObject({ cardSpace: "space-1", card: "card-1" })
      expect(
        yield* parseUpdateCardCommentParams({
          cardSpace: "space-1",
          card: "card-1",
          commentId: "comment-1",
          body: "Updated"
        })
      ).toMatchObject({ commentId: "comment-1", body: "Updated" })
      expect(
        yield* parseDeleteCardCommentParams({ cardSpace: "space-1", card: "card-1", commentId: "comment-1" })
      ).toMatchObject({ commentId: "comment-1" })
    })
  )

  it("accepts only true for a successful delete result", () => {
    const decode = Schema.decodeUnknownEither(DeleteCardCommentResultSchema)

    expect(Either.isRight(decode({ cardId: "card-1", commentId: "comment-1", deleted: true }))).toBe(true)
    expect(Either.isLeft(decode({ cardId: "card-1", commentId: "comment-1", deleted: false }))).toBe(true)
  })
})
