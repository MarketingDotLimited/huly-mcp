import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import { plannerTools } from "../../../src/mcp/tools/planner.js"
import { assertExists } from "../../../src/utils/assertions.js"

describe("plannerTools", () => {
  it.effect("exports planner tools in the planner category", () =>
    Effect.sync(function () {
      expect(plannerTools.map((tool) => tool.name)).toContain("create_todo")
      expect(plannerTools.map((tool) => tool.name)).toContain("schedule_todo")
      expect(plannerTools.map((tool) => tool.name)).not.toContain("list_todo_automation_helpers")
      for (const tool of plannerTools) {
        expect(tool.category).toBe("planner")
      }
    })
  )

  it("describes schedule_todo as a Planner-visible authenticated calendar operation", () => {
    const scheduleTool = assertExists(
      plannerTools.find((tool) => tool.name === "schedule_todo"),
      "schedule_todo tool"
    )

    expect(scheduleTool.description).toContain("authenticated user's personal calendar")
    expect(scheduleTool.description).toContain("Planner-visible")
  })
})
