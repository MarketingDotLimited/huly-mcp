import { describe } from "@effect/vitest"
import { expect, it } from "vitest"

import { parseJsonSchemaRecord } from "../../src/domain/schemas/json-schema.js"
import type { McpInputSchema } from "../../src/mcp/input-schema-compat.js"
import { toClientCompatibleInputSchema } from "../../src/mcp/input-schema-compat.js"

const expectRecord = (value: unknown): Record<string, unknown> => {
  const record = parseJsonSchemaRecord(value)
  if (record === undefined) {
    throw new Error("Expected record")
  }
  return record
}

describe("toClientCompatibleInputSchema", () => {
  it("resolves escaped local definition references and keeps root required fields", () => {
    const schema = {
      $ref: "#/$defs/Root~1Schema",
      $defs: { "Root/Schema": { type: "object", properties: { name: { type: "string" } }, required: ["name"] } }
    }

    const sanitized = toClientCompatibleInputSchema(schema)

    expect(sanitized.required).toEqual(["name"])
    expect(expectRecord(sanitized.properties).name).toEqual({ type: "string" })
  })

  it("ignores malformed and unresolved local definition references", () => {
    const malformed = toClientCompatibleInputSchema({ $ref: "#/$defs/%E0%A4%A", $defs: {} })
    const missing = toClientCompatibleInputSchema({ $ref: "#/$defs/Missing", $defs: {} })

    expect(malformed.properties).toBeUndefined()
    expect(missing.properties).toBeUndefined()
  })

  it("ignores local references without definitions and bounds recursive compositions", () => {
    const noDefinitions = toClientCompatibleInputSchema({ $ref: "#/$defs/Root" })
    let nested: object = { type: "object", properties: { deepest: { type: "string" } } }
    for (let depth = 0; depth < 10; depth += 1) nested = { allOf: [nested] }
    const bounded = toClientCompatibleInputSchema(nested)

    expect(noDefinitions.properties).toBeUndefined()
    expect(bounded.properties).toBeUndefined()
  })

  it("removes root composition while keeping branch-required constraints runtime-only", () => {
    const schema: McpInputSchema = {
      type: "object",
      required: ["project"],
      properties: { project: { type: "string" } },
      oneOf: [
        {
          required: ["issueIdentifier"],
          properties: { issueIdentifier: { type: "string" } },
          $defs: { IssueIdentifier: { type: "string" } },
          anyOf: [
            {
              required: ["document"],
              properties: { document: { type: "string" } },
              $defs: { DocumentIdentifier: { type: "string" } }
            }
          ]
        }
      ],
      allOf: [{ properties: { limit: { type: "integer" } } }]
    }

    const sanitized = toClientCompatibleInputSchema(schema)
    const properties = expectRecord(sanitized.properties)
    const defs = expectRecord(sanitized.$defs)

    expect(sanitized.type).toBe("object")
    expect(sanitized.oneOf).toBeUndefined()
    expect(sanitized.anyOf).toBeUndefined()
    expect(sanitized.allOf).toBeUndefined()
    expect(sanitized.required).toEqual(["project"])
    expect(sanitized.required).not.toContain("issueIdentifier")
    expect(sanitized.required).not.toContain("document")
    expect(properties.project).toBeDefined()
    expect(properties.issueIdentifier).toBeDefined()
    expect(properties.document).toBeDefined()
    expect(properties.limit).toBeDefined()
    expect(defs.IssueIdentifier).toBeDefined()
    expect(defs.DocumentIdentifier).toBeDefined()
  })

  it("accepts root-composition schemas and flattens their object branches", () => {
    const schema = {
      $schema: "http://json-schema.org/draft-07/schema#",
      anyOf: [
        {
          type: "object",
          required: ["personId"],
          properties: { personId: { type: "string" } },
          additionalProperties: false
        },
        {
          type: "object",
          required: ["email"],
          properties: { email: { type: "string", format: "email" } },
          additionalProperties: false
        }
      ],
      description: "Provide personId or email."
    }

    const sanitized = toClientCompatibleInputSchema(schema)
    const properties = expectRecord(sanitized.properties)

    expect(sanitized.type).toBe("object")
    expect(sanitized.anyOf).toBeUndefined()
    expect(sanitized.required).toBeUndefined()
    expect(sanitized.description).toBe("Provide personId or email.")
    expect(properties.personId).toBeDefined()
    expect(properties.email).toBeDefined()
  })

  it("ignores non-object composition branches", () => {
    const schema = { anyOf: [{ type: "object", properties: { project: { type: "string" } } }, "not-a-schema", null] }

    const sanitized = toClientCompatibleInputSchema(schema)
    const properties = expectRecord(sanitized.properties)

    expect(properties.project).toBeDefined()
    expect(sanitized.anyOf).toBeUndefined()
  })
})
