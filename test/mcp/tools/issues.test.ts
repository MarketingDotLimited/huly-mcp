import { describe, it } from "@effect/vitest"
import { expect } from "vitest"

import { issueTools } from "../../../src/mcp/tools/issues.js"
import { assertExists } from "../../../src/utils/assertions.js"

const issueTool = (name: string) =>
  assertExists(
    issueTools.find((tool) => tool.name === name),
    `Expected issue tool '${name}'.`
  )

const schemaField = (schema: unknown, field: string): unknown =>
  typeof schema === "object" && schema !== null ? Reflect.get(schema, field) : undefined

const requiredSchemaFields = (schema: unknown): ReadonlyArray<unknown> => {
  const required = schemaField(schema, "required")
  return Array.isArray(required) ? required : []
}

describe("issue tool contracts", () => {
  it("exposes human-readable label filtering and stable label summaries", () => {
    const listIssues = issueTool("list_issues")
    const getIssue = issueTool("get_issue")
    const listInput = JSON.stringify(listIssues.inputSchema)
    const listOutput = JSON.stringify(listIssues.outputSchema)
    const getOutput = JSON.stringify(getIssue.outputSchema)

    expect(listInput).toContain('"label"')
    expect(listInput.toLowerCase()).toContain("case-insensitive")
    expect(listIssues.description).toContain("human-readable attached label title")
    expect(listIssues.description).toContain("before")
    expect(listIssues.description).toContain("empty array")
    expect(getIssue.description).toContain("empty array")
    expect(listOutput).toContain('"labels"')
    expect(getOutput).toContain('"labels"')
    expect(listOutput).toContain('"color"')
    expect(getOutput).toContain('"color"')
  })

  it("exposes project-scoped milestone filtering and stable milestone summaries", () => {
    const listIssues = issueTool("list_issues")
    const getIssue = issueTool("get_issue")
    const listInput = JSON.stringify(listIssues.inputSchema)
    const listOutput = JSON.stringify(listIssues.outputSchema)
    const getOutput = JSON.stringify(getIssue.outputSchema)

    expect(listInput).toContain('"milestone"')
    expect(listInput).toContain('"hasMilestone"')
    expect(listInput).toContain("Milestone ID or exact")
    expect(listInput).toContain("Mutually exclusive with hasMilestone")
    expect(listInput).toContain("true = only scheduled issues")
    expect(listInput).toContain("false = only issues without a milestone")
    expect(listIssues.description).toContain("milestone")
    expect(listIssues.description).toContain("before the result limit")
    expect(listIssues.description).toContain("when resolvable")
    expect(getIssue.description).toContain("milestone")
    expect(getIssue.description).toContain("when resolvable")
    expect(listOutput).toContain('"milestone"')
    expect(getOutput).toContain('"milestone"')
    expect(listOutput).toContain('"id"')
    expect(listOutput).toContain('"label"')
    expect(requiredSchemaFields(schemaField(listIssues.outputSchema, "items"))).not.toContain("milestone")
    expect(requiredSchemaFields(getIssue.outputSchema)).not.toContain("milestone")
  })
})
