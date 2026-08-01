import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import { allTools } from "../../src/mcp/tools/index.js"

const toolNames = [
  "create_huly_enum",
  "update_huly_enum",
  "delete_huly_enum",
  "create_huly_attribute",
  "update_huly_attribute",
  "delete_huly_attribute"
] as const

describe("model administration MCP tools", () => {
  it.effect("registers guarded enum and attribute CRUD as one category", () =>
    Effect.sync(() => {
      const tools = toolNames.map((name) => allTools.find((tool) => tool.name === name))
      expect(tools.every((tool) => tool !== undefined)).toBe(true)
      expect(tools.map((tool) => tool?.category)).toEqual(toolNames.map(() => "model-administration"))
      for (const tool of tools) {
        expect(tool?.description).toContain("confirm=true")
        expect(tool?.inputSchema).toHaveProperty("required")
        expect(JSON.stringify(tool?.inputSchema)).toContain('"confirm"')
        expect(JSON.stringify(tool?.inputSchema)).toContain("true")
      }
    })
  )

  it.effect("documents name resolution and built-in protections", () =>
    Effect.sync(() => {
      const createAttribute = allTools.find((tool) => tool.name === "create_huly_attribute")
      const updateAttribute = allTools.find((tool) => tool.name === "update_huly_attribute")
      const deleteEnum = allTools.find((tool) => tool.name === "delete_huly_enum")
      expect(createAttribute?.description).toContain("class resolved by exact ID, tail name, or label")
      expect(updateAttribute?.description).toContain("Built-in attributes permit hidden-only updates")
      expect(updateAttribute?.description).toContain("Hide/unhide")
      expect(deleteEnum?.description).toContain("Refuses deletion")
    })
  )
})
