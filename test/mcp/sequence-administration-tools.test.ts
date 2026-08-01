import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import { allTools } from "../../src/mcp/tools/index.js"

const toolNames = ["create_huly_sequence", "update_huly_custom_sequence", "delete_huly_sequence"] as const

describe("sequence administration MCP tools", () => {
  it.effect("registers guarded sequence writes without exposing a counter update or raw transaction", () =>
    Effect.sync(() => {
      const tools = toolNames.map((name) => allTools.find((tool) => tool.name === name))
      expect(tools.every((tool) => tool !== undefined)).toBe(true)
      expect(tools.map((tool) => tool?.category)).toEqual(toolNames.map(() => "sequence-administration"))
      for (const tool of tools) {
        expect(tool?.description).toContain("confirm=true")
        expect(JSON.stringify(tool?.inputSchema)).not.toContain("currentValue")
      }
      expect(allTools.some((tool) => tool.name.includes("transaction"))).toBe(false)
    })
  )

  it.effect("documents retry and rollback guards for an LLM caller", () =>
    Effect.sync(() => {
      const create = allTools.find((tool) => tool.name === "create_huly_sequence")
      const update = allTools.find((tool) => tool.name === "update_huly_custom_sequence")
      const remove = allTools.find((tool) => tool.name === "delete_huly_sequence")

      expect(create?.description).toContain("never resets")
      expect(update?.description).toContain("does not change the counter")
      expect(remove?.description).toContain("expectedCurrentValue")
    })
  )
})
