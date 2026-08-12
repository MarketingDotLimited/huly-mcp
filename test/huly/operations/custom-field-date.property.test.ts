import { describe, it } from "@effect/vitest"
import { Effect, Result } from "effect"
import fc from "fast-check"
import { expect } from "vitest"

import { CUSTOM_FIELD_DATE_MAX_TIMESTAMP } from "../../../src/domain/schemas/custom-field-date.js"
import { parseCustomFieldDateValue } from "../../../src/huly/operations/custom-field-date.js"

describe("custom field date parsing properties", () => {
  it("returns a finite in-contract timestamp or a typed failure for every string", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = Effect.runSync(Effect.result(parseCustomFieldDateValue(input)))

        if (Result.isSuccess(result)) {
          expect(typeof result.success).toBe("number")
          expect(result.success).not.toBe(input)
          expect(Number.isFinite(result.success)).toBe(true)
          expect(Number.isInteger(result.success)).toBe(true)
          expect(result.success).toBeGreaterThanOrEqual(0)
          expect(result.success).toBeLessThanOrEqual(CUSTOM_FIELD_DATE_MAX_TIMESTAMP)
          if (input.length === 0) {
            expect(result.success).not.toBe(0)
          }
        } else {
          expect(result.failure._tag).toBe("InvalidCustomFieldDateValueError")
        }
      }),
      { numRuns: 500 }
    )
  })

  it("round-trips every generated in-contract epoch-millisecond string to its numeric value", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: CUSTOM_FIELD_DATE_MAX_TIMESTAMP }), (timestamp) => {
        const result = Effect.runSync(parseCustomFieldDateValue(String(timestamp)))
        expect(result).toBe(timestamp)
      }),
      { numRuns: 500 }
    )
  })
})
