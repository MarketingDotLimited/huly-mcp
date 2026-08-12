import { describe, it } from "@effect/vitest"
import { expect } from "vitest"

import {
  createComponentParamsJsonSchema,
  updateComponentParamsJsonSchema
} from "../../src/domain/schemas/components.js"
import { parseJsonSchemaRecord } from "../../src/domain/schemas/json-schema.js"
import {
  deleteRelatedIssueSpaceTargetParamsJsonSchema,
  setRelatedIssueTargetParamsJsonSchema
} from "../../src/domain/schemas/related-issue-targets.js"
import { listMeetingMinutesParamsJsonSchema } from "../../src/domain/schemas/virtual-office.js"

const description = (schema: object, field: string): unknown => {
  const properties = parseJsonSchemaRecord(parseJsonSchemaRecord(schema)?.properties)
  return parseJsonSchemaRecord(properties?.[field])?.description
}

describe("registry contraction public descriptions", () => {
  it("preserves operation-specific component descriptions", () => {
    expect(description(createComponentParamsJsonSchema, "lead")).toBe("Lead person email address or display name")
    expect(description(updateComponentParamsJsonSchema, "label")).toBe("New component name/label")
  })

  it("preserves related-target and virtual-office descriptions", () => {
    expect(description(setRelatedIssueTargetParamsJsonSchema, "targetProject")).toContain(
      "selected space or object class"
    )
    expect(description(deleteRelatedIssueSpaceTargetParamsJsonSchema, "space")).toContain("should be deleted")
    expect(description(listMeetingMinutesParamsJsonSchema, "attachedToId")).toContain("(minutes)")
  })
})
