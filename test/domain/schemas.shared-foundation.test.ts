import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { clearableText } from "../../src/domain/schemas/clearable.js"
import { AttachmentDescription, LocalFilePath } from "../../src/domain/schemas/domain-values.js"
import { toDraft07JsonSchema } from "../../src/domain/schemas/json-schema.js"
import { optionalOutput } from "../../src/domain/schemas/output-helpers.js"
import { ToolWarningCodeSchema, ToolWarningSchema } from "../../src/domain/schemas/tool-warnings.js"

describe("shared schema foundations", () => {
  it("keeps exact optional output fields absent and rejects explicit undefined and null", () => {
    const schema = Schema.Struct({ value: optionalOutput(Schema.String) })

    expect(Schema.decodeUnknownSync(schema)({})).toEqual({})
    expect(() => Schema.decodeUnknownSync(schema)({ value: undefined })).toThrow()
    expect(() => Schema.decodeUnknownSync(schema)({ value: null })).toThrow()
    expect(Schema.encodeUnknownSync(schema)({})).toEqual({})
  })

  it("accepts null and empty text as distinct clearable values", () => {
    const schema = clearableText("Description.")

    expect(Schema.decodeUnknownSync(schema)(null)).toBeNull()
    expect(Schema.decodeUnknownSync(schema)("")).toBe("")
    expect(() => Schema.decodeUnknownSync(schema)(undefined)).toThrow()
  })

  it("preserves representative branded domain value behavior", () => {
    expect(Schema.decodeUnknownSync(LocalFilePath)("/tmp/report.txt")).toBe("/tmp/report.txt")
    expect(Schema.decodeUnknownSync(AttachmentDescription)("")).toBe("")
    expect(() => Schema.decodeUnknownSync(LocalFilePath)(42)).toThrow()
  })

  it("accepts known warning codes and non-empty trimmed messages", () => {
    const warning = { code: ToolWarningCodeSchema.literals[0], message: "metadata unavailable" }

    expect(Schema.decodeUnknownSync(ToolWarningSchema)(warning)).toEqual(warning)
    expect(() => Schema.decodeUnknownSync(ToolWarningSchema)({ ...warning, code: "unknown_warning" })).toThrow()
    expect(() => Schema.decodeUnknownSync(ToolWarningSchema)({ ...warning, message: "" })).toThrow()
    expect(() => Schema.decodeUnknownSync(ToolWarningSchema)({ ...warning, message: "   " })).toThrow()
    expect(toDraft07JsonSchema(ToolWarningSchema)).toMatchObject({
      $defs: {
        ToolWarning: {
          properties: {
            message: {
              type: "string",
              allOf: [
                {
                  minLength: 1,
                  description:
                    "LLM-facing explanation of degraded result fidelity or an important operational condition requiring user action."
                }
              ]
            }
          }
        }
      }
    })
  })
})
