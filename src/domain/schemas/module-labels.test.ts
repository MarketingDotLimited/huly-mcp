import { describe, it } from "@effect/vitest"
import { Effect, Result, Schema } from "effect"
import { expect } from "vitest"

import { parseJsonSchemaRecord } from "./json-schema.js"
import {
  AddModuleLabelResultSchema,
  addDocumentLabelParamsJsonSchema,
  listDocumentLabelDefinitionsParamsJsonSchema,
  parseAddDocumentLabelParams,
  parseListDocumentLabelDefinitionsParams,
  RemoveModuleLabelResultSchema
} from "./module-labels.js"

const propertyDescription = (schema: object, field: string): unknown => {
  const properties = parseJsonSchemaRecord(parseJsonSchemaRecord(schema)?.properties)
  return parseJsonSchemaRecord(properties?.[field])?.description
}

describe("module label schemas", () => {
  it.effect("parses definition discovery and document attachment inputs", () =>
    Effect.gen(function* () {
      expect((yield* parseListDocumentLabelDefinitionsParams({ limit: 5 })).limit).toBe(5)
      expect(
        (yield* parseAddDocumentLabelParams({ teamspace: "Engineering", document: "Runbook", label: "Urgent" })).label
      ).toBe("Urgent")
    })
  )

  it("preserves public parameter descriptions", () => {
    expect(propertyDescription(listDocumentLabelDefinitionsParamsJsonSchema, "titleSearch")).toBe(
      "Optional label title substring search."
    )
    expect(propertyDescription(addDocumentLabelParamsJsonSchema, "label")).toContain("missing title creates")
    expect(propertyDescription(addDocumentLabelParamsJsonSchema, "color")).toContain("Ignored for an existing label")
  })

  it("preserves attainable mutation result variants", () => {
    expect(
      Result.isSuccess(
        Schema.decodeUnknownResult(AddModuleLabelResultSchema)({
          id: "ref-1",
          label: "label-1",
          title: "Urgent",
          attached: false,
          labelCreated: false
        })
      )
    ).toBe(true)
    expect(
      Result.isFailure(
        Schema.decodeUnknownResult(RemoveModuleLabelResultSchema)({
          label: "label-1",
          title: "Urgent",
          detached: false,
          detachedCount: 1
        })
      )
    ).toBe(true)
  })
})
