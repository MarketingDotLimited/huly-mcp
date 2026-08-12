import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  AccountUuid,
  Count,
  EmptyParamsSchema,
  ListTotal,
  UNKNOWN_TOTAL,
  emptyParamsJsonSchema
} from "../../../src/domain/schemas/shared.js"

describe("shared identifier schemas", () => {
  it("validates Huly account UUIDs as UUID strings", () => {
    expect(Schema.decodeUnknownSync(AccountUuid)("08e44bb3-dcb0-4564-9599-676dd16941ad")).toBe(
      "08e44bb3-dcb0-4564-9599-676dd16941ad"
    )

    expect(() => Schema.decodeUnknownSync(AccountUuid)("account-1")).toThrow()
    expect(() => Schema.decodeUnknownSync(AccountUuid)("")).toThrow()
  })

  it("preserves count and unknown-total bounds with v4 checks", () => {
    expect(Schema.decodeUnknownSync(Count)(0)).toBe(0)
    expect(Schema.decodeUnknownSync(ListTotal)(UNKNOWN_TOTAL)).toBe(UNKNOWN_TOTAL)
    expect(() => Schema.decodeUnknownSync(Count)(UNKNOWN_TOTAL)).toThrow()
    expect(() => Schema.decodeUnknownSync(Count)(1.5)).toThrow()
    expect(() => Schema.decodeUnknownSync(ListTotal)(-2)).toThrow()
  })

  it("preserves the permissive v3 empty-struct runtime behavior", () => {
    expect(Schema.decodeUnknownSync(EmptyParamsSchema)({})).toEqual({})
    expect(Schema.decodeUnknownSync(EmptyParamsSchema)({ unexpected: true })).toEqual({ unexpected: true })
    expect(Schema.decodeUnknownSync(EmptyParamsSchema)([])).toEqual([])
  })

  it("emits the closed empty-object Draft-07 shape", () => {
    expect(emptyParamsJsonSchema).toEqual({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {},
      additionalProperties: false
    })
  })
})
