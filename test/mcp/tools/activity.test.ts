import { describe, it } from "@effect/vitest"
import { expect } from "vitest"

import { activityTools } from "../../../src/mcp/tools/activity.js"

describe("activity tools", () => {
  it("documents stable omission of null optional activity fields", () => {
    const listActivity = activityTools.find(tool => tool.name === "list_activity")

    expect(listActivity?.description).toContain("absent or null optional")
    expect(listActivity?.description).toContain("omitted")
  })

  it("registers activity message tools", () => {
    const names = new Set(activityTools.map(tool => tool.name))
    const expected = [
      "get_activity_message",
      "pin_activity_message",
      "list_activity_filters",
      "list_activity_references",
      "list_activity_replies",
      "add_activity_reply",
      "update_activity_reply",
      "delete_activity_reply"
    ]

    for (const name of expected) {
      expect(names.has(name), name).toBe(true)
    }
  })
})
