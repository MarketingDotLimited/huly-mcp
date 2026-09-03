import { Ajv } from "ajv"
import ajvFormats from "ajv-formats"
import { describe, expect, it } from "vitest"
import { allTools, toolRegistry } from "../../src/mcp/tools/index.js"
import {
  requiresTwoStepApproval,
  isDirectWriteEligible,
  classifyToolInvocation
} from "../../src/mcp/proxy-tool-approvals.js"
import { proxyToolDefinitions, PROXY_TOOL_NAMES } from "../../src/mcp/proxy-tools.js"
import { getHulyContextToolDefinition, versionToolDefinition } from "../../src/mcp/huly-context-tool.js"
import { resolveAnnotations, ToolName, makeToolCategory } from "../../src/mcp/tools/registry.js"

describe("Huly Catalog Audit", () => {
  it("has exactly 550 canonical tools", () => {
    expect(allTools.length).toBe(550)
  })

  it("ensures every schema compiles with Ajv strict Draft-07 setup", () => {
    const ajv = new Ajv({ strict: true, strictRequired: false })
    ajvFormats.default(ajv)
    for (const tool of allTools) {
      expect(tool.inputSchema).toBeDefined()
      expect(tool.outputSchema).toBeDefined()

      // Ensure Draft-07 marker is present
      expect(tool.inputSchema, `inputSchema missing $schema on ${tool.name}`).toHaveProperty(
        "$schema",
        "http://json-schema.org/draft-07/schema#"
      )
      expect(tool.outputSchema, `outputSchema missing $schema on ${tool.name}`).toHaveProperty(
        "$schema",
        "http://json-schema.org/draft-07/schema#"
      )

      expect(() => ajv.compile(tool.inputSchema)).not.toThrow()
      expect(() => ajv.compile(tool.outputSchema)).not.toThrow()
    }
  }, 30_000)

  it("classifies every target exactly once as read-only or write-capable", () => {
    for (const tool of allTools) {
      const annotations = resolveAnnotations(tool)
      const toolClass = classifyToolInvocation(tool)

      const isReadOnly = toolClass === "read-only"
      const directWrite = isDirectWriteEligible(tool)
      const requiresApproval = requiresTwoStepApproval(tool)

      expect(annotations.readOnlyHint === true).toBe(isReadOnly)

      // readOnly XOR writeCapable
      const isWriteCapable = directWrite || requiresApproval
      expect(isReadOnly !== isWriteCapable).toBe(true)

      if (isReadOnly) {
        expect(directWrite).toBe(false)
        expect(requiresApproval).toBe(false)
      } else {
        // EXACTLY one of direct-write or approval-required
        expect(directWrite !== requiresApproval).toBe(true)
      }
    }
  })

  it("asserts destructive/approval metadata consistency", () => {
    for (const tool of allTools) {
      const annotations = resolveAnnotations(tool)
      const requiresApproval = requiresTwoStepApproval(tool)
      const directWrite = isDirectWriteEligible(tool)

      // destructiveHint===true implies requiresTwoStepApproval
      if (annotations.destructiveHint === true) {
        expect(requiresApproval).toBe(true)
      }

      // requiresApproval implies write-capable
      if (requiresApproval) {
        expect(annotations.readOnlyHint).not.toBe(true)
      }

      // read-only cannot be destructive or approval-required
      if (annotations.readOnlyHint === true) {
        expect(annotations.destructiveHint).not.toBe(true)
        expect(requiresApproval).toBe(false)
        expect(directWrite).toBe(false)
      }
    }
  })

  it("asserts bidirectional registration/handler parity without loops", () => {
    expect(toolRegistry.tools.size).toBe(allTools.length)

    const registryKeys = Array.from(toolRegistry.tools.keys()).sort()
    const allToolsNames = allTools.map((t) => t.name).sort()

    // Direct sorted comparison
    expect(registryKeys).toEqual(allToolsNames)

    // Every entry must have a handler
    for (const tool of allTools) {
      const registered = toolRegistry.tools.get(tool.name)
      expect(registered).toBeDefined()
      expect(registered?.handler).toBeDefined()
    }
  })

  it("asserts exact canonical top-level MCP tools and proxy parity", () => {
    const builtIns = [versionToolDefinition, getHulyContextToolDefinition]
    expect(builtIns.length).toBe(2)

    expect(proxyToolDefinitions.length).toBe(8)

    // PROXY_TOOL_NAMES equality
    const proxyNames = proxyToolDefinitions.map((t) => t.name)
    expect(proxyNames).toEqual(PROXY_TOOL_NAMES)

    const topLevelTools = [...builtIns, ...proxyToolDefinitions]
    expect(topLevelTools.length).toBe(10)

    const expectedOrder = [
      "get_version",
      "get_huly_context",
      "list_tool_categories",
      "search_tools",
      "get_tool_schema",
      "invoke_read_tool",
      "invoke_write_tool",
      "invoke_tool",
      "prepare_tool_action",
      "execute_approved_tool_action"
    ]

    expect(topLevelTools.map((t) => t.name)).toEqual(expectedOrder)

    // Ensure no obsolete execute_tool_action
    expect(topLevelTools.some((t) => t.name === "execute_tool_action")).toBe(false)

    const ajv = new Ajv({ strict: true, strictRequired: false })
    ajvFormats.default(ajv)
    for (const tool of topLevelTools) {
      expect(typeof tool.description).toBe("string")
      expect(tool.description.length).toBeGreaterThan(0)

      expect(tool.inputSchema).toBeDefined()
      expect(tool.outputSchema).toBeDefined()
      expect(() => ajv.compile(tool.inputSchema)).not.toThrow()
      expect(() => ajv.compile(tool.outputSchema)).not.toThrow()

      const annotations = resolveAnnotations(tool)
      expect(annotations).toBeDefined()

      // Top-level annotations must explicitly contain boolean readOnlyHint, destructiveHint, idempotentHint, openWorldHint
      expect(typeof annotations.readOnlyHint).toBe("boolean")
      expect(typeof annotations.destructiveHint).toBe("boolean")
      expect(typeof annotations.idempotentHint).toBe("boolean")
      expect(typeof annotations.openWorldHint).toBe("boolean")

      expect(typeof annotations.title).toBe("string")
      expect((annotations.title as string).length).toBeGreaterThan(0)

      // Coherent safety invariants
      if (annotations.readOnlyHint === true) {
        expect(annotations.destructiveHint).toBe(false)
      }
      if (annotations.destructiveHint === true) {
        expect(annotations.readOnlyHint).toBe(false)
      }
    }
  })

  it("regression: unannotated ordinary tool is direct-write while delete/high-impact are approval-required", () => {
    const ordinary = classifyToolInvocation({
      name: ToolName.make("my_custom_action"),
      category: makeToolCategory("test")
    })
    expect(ordinary).toBe("direct-write")

    const deleteTool = classifyToolInvocation({
      name: ToolName.make("delete_something"),
      category: makeToolCategory("test")
    })
    expect(deleteTool).toBe("approval-required")

    const highImpact = classifyToolInvocation({
      name: ToolName.make("my_action"),
      category: makeToolCategory("workspace")
    })
    expect(highImpact).toBe("approval-required")
  })
})
