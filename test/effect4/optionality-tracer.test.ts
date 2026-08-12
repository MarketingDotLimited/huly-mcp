import { assert, describe, it } from "@effect/vitest"
import { Schema } from "effect"
import { OptionalKeyFixture, OptionalValueFixture } from "./optionality-tracer-fixture.js"

const hasValue = (input: object): boolean => Object.hasOwn(input, "value")

describe("Effect 4 schema optionality tracer", () => {
  describe("decoding", () => {
    it("preserves an absent Schema.optional field as absent", () => {
      const decoded = Schema.decodeUnknownSync(OptionalValueFixture)({})

      assert.deepStrictEqual(decoded, {})
      assert.isFalse(hasValue(decoded))
    })

    it("preserves an explicitly undefined Schema.optional field as present", () => {
      const decoded = Schema.decodeUnknownSync(OptionalValueFixture)({ value: undefined })

      assert.deepStrictEqual(decoded, { value: undefined })
      assert.isTrue(hasValue(decoded))
    })

    it("gives Schema.optionalKey exact absence semantics", () => {
      const decoded = Schema.decodeUnknownSync(OptionalKeyFixture)({})

      assert.deepStrictEqual(decoded, {})
      assert.isFalse(hasValue(decoded))
      assert.throws(() => Schema.decodeUnknownSync(OptionalKeyFixture)({ value: undefined }))
    })

    it("rejects null for both non-nullable optional field forms", () => {
      assert.throws(() => Schema.decodeUnknownSync(OptionalValueFixture)({ value: null }))
      assert.throws(() => Schema.decodeUnknownSync(OptionalKeyFixture)({ value: null }))
    })
  })

  describe("encoding and JSON serialization", () => {
    it("keeps an absent Schema.optional field absent when encoded", () => {
      const decoded = Schema.decodeUnknownSync(OptionalValueFixture)({})
      const encoded = Schema.encodeSync(OptionalValueFixture)(decoded)

      assert.deepStrictEqual(encoded, {})
      assert.isFalse(hasValue(encoded))
    })

    it("preserves explicit undefined in raw encoding while JSON omits it", () => {
      const decoded = Schema.decodeUnknownSync(OptionalValueFixture)({ value: undefined })
      const encoded = Schema.encodeSync(OptionalValueFixture)(decoded)

      assert.deepStrictEqual(encoded, { value: undefined })
      assert.isTrue(hasValue(encoded))
      assert.strictEqual(JSON.stringify(encoded), "{}")
    })

    it("encodes a decoded Schema.optionalKey absence without adding the key", () => {
      const decoded = Schema.decodeUnknownSync(OptionalKeyFixture)({})
      const encoded = Schema.encodeSync(OptionalKeyFixture)(decoded)

      assert.deepStrictEqual(encoded, {})
      assert.isFalse(hasValue(encoded))
      assert.strictEqual(JSON.stringify(encoded), "{}")
    })

    it("rejects explicit undefined when encoding an unknown Schema.optionalKey value", () => {
      assert.throws(() => Schema.encodeUnknownSync(OptionalKeyFixture)({ value: undefined }))
    })
  })
})
