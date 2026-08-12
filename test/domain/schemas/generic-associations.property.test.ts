import { describe } from "@effect/vitest"
import { Result, Schema } from "effect"
import * as fc from "fast-check"
import { expect, it } from "vitest"

import {
  DeleteRelationParamsSchema,
  GenericObjectLocatorSchema,
  ListRelationsParamsSchema
} from "../../../src/domain/schemas/generic-associations.js"
import { propertyTestParameters } from "../../helpers/property.js"

const strictParseOptions = { onExcessProperty: "error" } as const

const idArbitrary = fc.stringMatching(/^[a-z][a-z0-9_-]{0,18}$/)
const classArbitrary = fc.stringMatching(/^[a-z]+:class:[A-Za-z][A-Za-z0-9]{0,18}$/)

const rawLocatorArbitrary = fc.record({
  kind: fc.constant("raw"),
  id: idArbitrary,
  class: fc.option(classArbitrary, { nil: undefined })
})

const issueLocatorArbitrary = fc.record({
  kind: fc.constant("issue"),
  issue: fc.stringMatching(/^[A-Z]{2,5}-[1-9][0-9]{0,5}$/),
  project: fc.option(fc.stringMatching(/^[A-Z]{2,5}$/), { nil: undefined })
})

const documentLocatorArbitrary = fc.record({
  kind: fc.constant("document"),
  document: idArbitrary,
  teamspace: fc.option(idArbitrary, { nil: undefined })
})

const cardLocatorArbitrary = fc.record({
  kind: fc.constant("card"),
  card: idArbitrary,
  cardSpace: fc.option(idArbitrary, { nil: undefined })
})

const locatorArbitrary = fc.oneof(
  rawLocatorArbitrary,
  issueLocatorArbitrary,
  documentLocatorArbitrary,
  cardLocatorArbitrary
)

const decodeSucceeds = (schema: Schema.ConstraintDecoder<unknown>, input: unknown): boolean =>
  Result.isSuccess(Schema.decodeUnknownResult(schema, strictParseOptions)(input))

describe("generic association locator properties", () => {
  it("GenericObjectLocatorSchema accepts each explicit locator kind under strict decoding", () => {
    fc.assert(
      fc.property(locatorArbitrary, (locator) => {
        expect(decodeSucceeds(GenericObjectLocatorSchema, locator)).toBe(true)
      }),
      propertyTestParameters
    )
  })

  it("GenericObjectLocatorSchema rejects cross-kind field subsets under strict decoding", () => {
    fc.assert(
      fc.property(locatorArbitrary, (locator) => {
        const poisonedLocator = { ...locator, issue: "HULY-1", document: "Doc", card: "Card", unexpected: "extra" }

        expect(decodeSucceeds(GenericObjectLocatorSchema, poisonedLocator)).toBe(false)
      }),
      propertyTestParameters
    )
  })

  it("ListRelationsParamsSchema requires a narrowing association, source, or target", () => {
    fc.assert(
      fc.property(locatorArbitrary, fc.constantFrom("association", "source", "target"), (locator, field) => {
        expect(decodeSucceeds(ListRelationsParamsSchema, {})).toBe(false)
        expect(
          decodeSucceeds(ListRelationsParamsSchema, { [field]: field === "association" ? "Dependency" : locator })
        ).toBe(true)
      }),
      propertyTestParameters
    )
  })

  it("DeleteRelationParamsSchema is a strict either-by-id or by-triple union", () => {
    fc.assert(
      fc.property(locatorArbitrary, locatorArbitrary, idArbitrary, (source, target, relation) => {
        expect(decodeSucceeds(DeleteRelationParamsSchema, { relation })).toBe(true)
        expect(decodeSucceeds(DeleteRelationParamsSchema, { association: "Dependency", source, target })).toBe(true)

        expect(decodeSucceeds(DeleteRelationParamsSchema, { relation, association: "Dependency" })).toBe(false)
        expect(decodeSucceeds(DeleteRelationParamsSchema, { association: "Dependency", source })).toBe(false)
        expect(decodeSucceeds(DeleteRelationParamsSchema, { relation, source, target })).toBe(false)
      }),
      propertyTestParameters
    )
  })
})
