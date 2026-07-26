import { describe, it } from "@effect/vitest"
import { Effect, Either } from "effect"
import fc from "fast-check"
import { expect } from "vitest"

import { CUSTOM_FIELD_DATE_MAX_TIMESTAMP } from "../../../src/domain/schemas/custom-field-date.js"
import { parseCustomFieldDateValue } from "../../../src/huly/operations/custom-field-date.js"

describe("custom field date parsing properties", () => {
  it("returns a finite in-contract timestamp or a typed failure for every string", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = Effect.runSync(Effect.either(parseCustomFieldDateValue(input)))

        if (Either.isRight(result)) {
          expect(typeof result.right).toBe("number")
          expect(result.right).not.toBe(input)
          expect(Number.isFinite(result.right)).toBe(true)
          expect(Number.isInteger(result.right)).toBe(true)
          expect(result.right).toBeGreaterThanOrEqual(0)
          expect(result.right).toBeLessThanOrEqual(CUSTOM_FIELD_DATE_MAX_TIMESTAMP)
          if (input.length === 0) {
            expect(result.right).not.toBe(0)
          }
        } else {
          expect(result.left._tag).toBe("InvalidCustomFieldDateValueError")
        }
      }),
      { numRuns: 500 }
    )
  })

  it("round-trips every generated in-contract epoch-millisecond string to its numeric value", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: CUSTOM_FIELD_DATE_MAX_TIMESTAMP }),
        (timestamp) => {
          const result = Effect.runSync(parseCustomFieldDateValue(String(timestamp)))
          expect(result).toBe(timestamp)
        }
      ),
      { numRuns: 500 }
    )
  })
})
