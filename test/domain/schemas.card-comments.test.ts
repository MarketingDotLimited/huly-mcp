import { describe, it } from "@effect/vitest"
import { Effect, Result, Schema } from "effect"
import { expect } from "vitest"

import {
  DeleteCardCommentResultSchema,
  addCardCommentParamsJsonSchema,
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
        Result.isFailure(
          yield* Effect.result(parseAddCardCommentParams({ cardSpace: "space-1", card: "card-1", body: "" }))
        )
      ).toBe(true)
      expect(
        Result.isFailure(
          yield* Effect.result(
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
    const decode = Schema.decodeUnknownResult(DeleteCardCommentResultSchema)

    expect(Result.isSuccess(decode({ cardId: "card-1", commentId: "comment-1", deleted: true }))).toBe(true)
    expect(Result.isFailure(decode({ cardId: "card-1", commentId: "comment-1", deleted: false }))).toBe(true)
  })

  it("preserves public field descriptions", () => {
    expect(JSON.stringify(addCardCommentParamsJsonSchema)).toContain("Comment body in markdown")
    expect(JSON.stringify(addCardCommentParamsJsonSchema)).toContain("Card space name or ID")
  })
})
