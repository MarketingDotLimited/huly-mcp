import { describe, it } from "@effect/vitest"
import { expect } from "vitest"

import { issueTools } from "../../../src/mcp/tools/issues.js"
import { assertExists } from "../../../src/utils/assertions.js"

const issueTool = (name: string) =>
  assertExists(
    issueTools.find((tool) => tool.name === name),
    `Expected issue tool '${name}'.`
  )

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
})
