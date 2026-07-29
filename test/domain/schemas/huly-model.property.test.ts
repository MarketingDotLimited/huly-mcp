import { describe } from "@effect/vitest"
import { ClassifierKind } from "@hcengineering/core"
import { Schema } from "effect"
import * as fc from "fast-check"
import { expect, it } from "vitest"

import { CustomFieldInfoWireSchema } from "../../../src/domain/schemas/custom-fields.js"
import { HulyAttributeTypeSchema, HulySdkClassifierKindSchema } from "../../../src/domain/schemas/sdk-discovery.js"
import { propertyTestParameters } from "../../helpers/property.js"

const idArbitrary = fc.stringMatching(/^[a-z][a-z0-9_-]{0,18}$/)
const classArbitrary = fc.stringMatching(/^[a-z]+:(class|mixin|interface):[A-Za-z][A-Za-z0-9]{0,18}$/)

interface HulyAttributeTypeFixture {
  readonly kind:
    | "string"
    | "number"
    | "boolean"
    | "date"
    | "markup"
    | "unknown"
    | "ref"
    | "enum"
    | "collection"
    | "array"
  readonly classId?: string | undefined
  readonly raw?: Record<string, unknown> | undefined
  readonly refTo?: string | undefined
  readonly enumId?: string | undefined
  readonly collectionOf?: string | undefined
  readonly arrayOf?: HulyAttributeTypeFixture | undefined
}

const rawDetailsArbitrary = fc.dictionary(
  fc.stringMatching(/^[a-z][a-z0-9_]{0,8}$/),
  fc.oneof(fc.string({ maxLength: 20 }), fc.integer({ min: -100, max: 100 }), fc.boolean()),
  { maxKeys: 3 }
)
const detailsWithoutRequiredCustomFieldKeysArbitrary = fc.dictionary(
  fc.stringMatching(/^[a-z][a-z0-9_]{0,8}$/).filter((key) => key !== "enumRef" && key !== "of" && key !== "to"),
  fc.oneof(fc.string({ maxLength: 20 }), fc.integer({ min: -100, max: 100 }), fc.boolean()),
  { maxKeys: 3 }
)

const attributeTypeArbitrary = (depth: number): fc.Arbitrary<HulyAttributeTypeFixture> => {
  const baseFields = fc.record({
    classId: fc.option(classArbitrary, { nil: undefined }),
    raw: fc.option(rawDetailsArbitrary, { nil: undefined })
  })

  const scalar = baseFields.chain((base) =>
    fc.constantFrom("string", "number", "boolean", "date", "markup", "unknown").map((kind) => ({ ...base, kind }))
  )
  const ref = baseFields.chain((base) => classArbitrary.map((refTo) => ({ ...base, kind: "ref" as const, refTo })))
  const enumType = baseFields.chain((base) => idArbitrary.map((enumId) => ({ ...base, kind: "enum" as const, enumId })))
  const collection = baseFields.chain((base) =>
    classArbitrary.map((collectionOf) => ({ ...base, kind: "collection" as const, collectionOf }))
  )
  const variants = [scalar, ref, enumType, collection]

  if (depth <= 0) {
    return fc.oneof(...variants)
  }

  const array = baseFields.chain((base) =>
    attributeTypeArbitrary(depth - 1).map((arrayOf) => ({ ...base, kind: "array" as const, arrayOf }))
  )

  return fc.oneof(...variants, array)
}

const customFieldBaseArbitrary = fc.record({
  id: idArbitrary,
  name: fc.string({ maxLength: 20 }),
  label: fc.string({ maxLength: 20 }),
  ownerClassId: classArbitrary,
  ownerLabel: fc.string({ maxLength: 20 })
})

const primitiveCustomFieldTypeArbitrary = fc.constantFrom("string", "number", "boolean", "date", "markup")

const decodeSucceeds = (schema: Schema.Schema.AnyNoContext, input: unknown): boolean =>
  Schema.decodeUnknownEither(schema)(input)._tag === "Right"

describe("Huly model schema properties", () => {
  it("HulyAttributeTypeSchema recursively decodes and encodes generated attribute types", () => {
    fc.assert(
      fc.property(attributeTypeArbitrary(3), (attributeType) => {
        const decoded = Schema.decodeUnknownEither(HulyAttributeTypeSchema)(attributeType)

        expect(decoded._tag).toBe("Right")
        if (decoded._tag === "Right") {
          const encoded = Schema.encodeEither(HulyAttributeTypeSchema)(decoded.right)

          expect(encoded._tag).toBe("Right")
          if (encoded._tag === "Right") {
            expect(encoded.right).toEqual(attributeType)
          }
        }
      }),
      propertyTestParameters
    )
  })

  it("HulyAttributeTypeSchema rejects variants missing kind-specific required fields", () => {
    fc.assert(
      fc.property(
        fc.constantFrom({ kind: "ref" }, { kind: "enum" }, { kind: "collection" }, { kind: "array" }),
        (attributeType) => {
          expect(decodeSucceeds(HulyAttributeTypeSchema, attributeType)).toBe(false)
        }
      ),
      propertyTestParameters
    )
  })

  it("HulySdkClassifierKindSchema roundtrips the SDK classifier enum values", () => {
    const pairs = [
      [ClassifierKind.CLASS, "class"],
      [ClassifierKind.INTERFACE, "interface"],
      [ClassifierKind.MIXIN, "mixin"]
    ] as const

    for (const [sdkKind, wireKind] of pairs) {
      const decoded = Schema.decodeUnknownEither(HulySdkClassifierKindSchema)(sdkKind)
      const encoded = Schema.encodeEither(HulySdkClassifierKindSchema)(wireKind)

      expect(decoded._tag).toBe("Right")
      if (decoded._tag === "Right") {
        expect(decoded.right).toBe(wireKind)
      }
      expect(encoded._tag).toBe("Right")
      if (encoded._tag === "Right") {
        expect(encoded.right).toBe(sdkKind)
      }
    }
  })

  it("CustomFieldInfoWireSchema enforces typeDetails required by the custom field type", () => {
    fc.assert(
      fc.property(customFieldBaseArbitrary, primitiveCustomFieldTypeArbitrary, (base, type) => {
        expect(decodeSucceeds(CustomFieldInfoWireSchema, { ...base, type, typeDetails: {} })).toBe(true)
        expect(
          decodeSucceeds(CustomFieldInfoWireSchema, {
            ...base,
            type,
            typeDetails: { extra: "not allowed for primitives" }
          })
        ).toBe(false)
      }),
      propertyTestParameters
    )

    fc.assert(
      fc.property(
        customFieldBaseArbitrary,
        rawDetailsArbitrary,
        detailsWithoutRequiredCustomFieldKeysArbitrary,
        (base, extraDetails, missingDetails) => {
          expect(
            decodeSucceeds(CustomFieldInfoWireSchema, {
              ...base,
              type: "enum",
              typeDetails: { ...extraDetails, enumRef: "status" }
            })
          ).toBe(true)
          expect(
            decodeSucceeds(CustomFieldInfoWireSchema, {
              ...base,
              type: "array",
              typeDetails: { ...extraDetails, of: "string" }
            })
          ).toBe(true)
          expect(
            decodeSucceeds(CustomFieldInfoWireSchema, {
              ...base,
              type: "ref",
              typeDetails: { ...extraDetails, to: "tracker:class:Issue" }
            })
          ).toBe(true)
          expect(
            decodeSucceeds(CustomFieldInfoWireSchema, { ...base, type: "unknown", typeDetails: extraDetails })
          ).toBe(true)

          expect(
            decodeSucceeds(CustomFieldInfoWireSchema, { ...base, type: "enum", typeDetails: missingDetails })
          ).toBe(false)
          expect(
            decodeSucceeds(CustomFieldInfoWireSchema, { ...base, type: "array", typeDetails: missingDetails })
          ).toBe(false)
          expect(decodeSucceeds(CustomFieldInfoWireSchema, { ...base, type: "ref", typeDetails: missingDetails })).toBe(
            false
          )
        }
      ),
      propertyTestParameters
    )
  })
})
