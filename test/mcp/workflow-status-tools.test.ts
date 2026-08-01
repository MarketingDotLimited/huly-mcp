import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import { allTools } from "../../src/mcp/tools/index.js"

const WORKFLOW_TOOL_NAMES = [
  "list_workflow_statuses",
  "get_workflow_status",
  "create_workflow_status",
  "update_workflow_status",
  "delete_workflow_status",
  "list_status_categories",
  "get_status_category",
  "create_status_category",
  "update_status_category",
  "delete_status_category"
] as const

describe("generic workflow status MCP tools", () => {
  it.effect("registers the complete generic status and category CRUD surface", () =>
    Effect.sync(() => {
      const names = new Set(allTools.map((tool) => tool.name))

      for (const name of WORKFLOW_TOOL_NAMES) expect(names.has(name)).toBe(true)
    })
  )

  it.effect("keeps generic workflow tools separate from the tracker issue wrapper", () =>
    Effect.sync(() => {
      const genericCreate = allTools.find((tool) => tool.name === "create_workflow_status")
      const issueCreate = allTools.find((tool) => tool.name === "create_issue_status")

      expect(genericCreate?.category).toBe("workflow-statuses")
      expect(issueCreate?.category).toBe("task-management")
      expect(genericCreate?.description).toContain("attribute")
    })
  )
})
