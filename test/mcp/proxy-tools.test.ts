import { describe, expect, it } from "vitest"

import { versionToolDefinition } from "../../src/mcp/huly-context-tool.js"
import { handleProxyToolCall } from "../../src/mcp/proxy-tools.js"
import type { ToolRegistry } from "../../src/mcp/tools/index.js"
import { createToolDefinition, makeToolName, type ToolDefinition } from "../../src/mcp/tools/registry.js"

const definition = (name: string, inputSchema: object, category = "test"): ToolDefinition =>
  createToolDefinition({
    name,
    description: `${name} catalog coverage probe`,
    inputSchema,
    outputSchema: versionToolDefinition.outputSchema,
    category
  })

const definitions = [
  definition("empty_probe", { type: "object", properties: {}, additionalProperties: false }),
  definition("available_probe", {
    type: "object",
    properties: { required_value: { type: "string" }, optional_value: { type: "number" } },
    required: ["required_value"]
  }),
  definition("array_probe", []),
  definition("invalid_property_probe", { type: "object", properties: { " ": { type: "string" } } }),
  definition("invalid_required_probe", { type: "object", properties: { value: { type: "string" } }, required: [" "] }),
  definition("undeclared_required_probe", {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["missing"]
  }),
  definition("unknown_category_probe", { type: "object", properties: {} }, "new-category")
]

const registry: ToolRegistry = { tools: new Map(), definitions, handleToolCall: async () => null }

const call = (toolName: string, args: unknown) =>
  handleProxyToolCall({ toolName: makeToolName(toolName), args, proxyCandidateRegistry: registry })

describe("proxy tool catalog edge cases", () => {
  it("reports every parameter-summary status instead of silently losing schema information", async () => {
    const expected = new Map([
      ["empty_probe", "empty"],
      ["available_probe", "available"],
      ["array_probe", "invalid_input_schema"],
      ["invalid_property_probe", "invalid_input_schema"],
      ["invalid_required_probe", "invalid_input_schema"],
      ["undeclared_required_probe", "invalid_input_schema"]
    ])

    for (const [name, status] of expected) {
      const response = await call("search_tools", { query: name, limit: 1 })
      expect(response.structuredContent).toHaveProperty("result.matches.0.parameterSummaryStatus", status)
    }
  })

  it("returns no search matches when a non-empty query has no searchable tokens", async () => {
    const response = await call("search_tools", { query: "___" })
    expect(response.structuredContent).toEqual({ result: { matches: [] } })
  })

  it("uses fallback descriptions for newly introduced categories", async () => {
    const response = await call("list_tool_categories", {})
    expect(response.structuredContent).toHaveProperty(
      "result.categories",
      expect.arrayContaining([
        expect.objectContaining({ name: "new-category", description: "Huly new-category tools.", toolCount: 1 })
      ])
    )
  })
})
