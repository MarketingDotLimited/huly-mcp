import { Effect, Schema } from "effect"
import { describe, expect, it } from "vitest"

import { formatParseError } from "../../src/mcp/schema-error-format.js"

describe("Schema error formatting", () => {
  it("preserves the Effect 3 path and actual-value contract", async () => {
    const schema = Schema.Struct({ name: Schema.String, age: Schema.Number })
    const error = await Effect.runPromise(
      Schema.decodeUnknownEffect(schema)({ name: 123, age: "old" }, { errors: "all", reportInput: true }).pipe(
        Effect.flip
      )
    )

    expect(formatParseError(error)).toBe('name: Expected string, actual 123; age: Expected number, actual "old"')
  })

  it("preserves the missing-field wording", async () => {
    const error = await Effect.runPromise(
      Schema.decodeUnknownEffect(Schema.Struct({ name: Schema.String }))({}).pipe(Effect.flip)
    )

    expect(formatParseError(error)).toBe("name: is missing")
  })

  it("preserves authored messages without rewriting their prose", async () => {
    const schema = Schema.Struct({ name: Schema.String.annotate({ message: "custom, got wording stays authored" }) })
    const error = await Effect.runPromise(
      Schema.decodeUnknownEffect(schema)({ name: 123 }, { reportInput: true }).pipe(Effect.flip)
    )

    expect(formatParseError(error)).toBe("name: custom, got wording stays authored")
  })
})
