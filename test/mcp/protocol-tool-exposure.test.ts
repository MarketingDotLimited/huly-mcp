import { describe, expect, it } from "vitest"

import {
  defaultExposureOptions,
  normalizeRegistries,
  resolveProtocolExposure,
  toListedHulyTool,
  toListedTool,
  type ProtocolExposureOptions
} from "../../src/mcp/protocol-tool-exposure.js"
import { parseMcpClientInfo } from "../../src/mcp/tool-mode.js"
import { toolRegistry } from "../../src/mcp/tools/index.js"
import type { ToolRegistry } from "../../src/mcp/tools/index.js"

const scopedRegistry: ToolRegistry = {
  ...toolRegistry,
  tools: new Map([...toolRegistry.tools].slice(0, 1)),
  definitions: toolRegistry.definitions.slice(0, 1)
}

const options = (
  configuredMode: "auto" | "native" | "proxy",
  proxyOutputStrict: boolean,
  toolScopeFilteringActive: boolean,
  clientName?: string
): ProtocolExposureOptions => ({
  exposureConfig: { configuredMode, proxyOutputStrict },
  toolScopeFilteringActive,
  currentClientInfo: () => (clientName === undefined ? undefined : parseMcpClientInfo({ name: clientName }))
})

describe("protocol tool exposure", () => {
  it("normalizes a single registry and preserves an explicit registry pair", () => {
    expect(normalizeRegistries(toolRegistry)).toEqual({
      fullRegistry: toolRegistry,
      scopedNativeRegistry: toolRegistry
    })
    const pair = { fullRegistry: toolRegistry, scopedNativeRegistry: scopedRegistry }
    expect(normalizeRegistries(pair)).toBe(pair)
    expect(defaultExposureOptions()).toMatchObject({
      exposureConfig: { configuredMode: "native", proxyOutputStrict: false },
      toolScopeFilteringActive: false
    })
  })

  it("resolves forced native and proxy modes with their visible counts", () => {
    const registries = { fullRegistry: toolRegistry, scopedNativeRegistry: scopedRegistry }
    const native = resolveProtocolExposure(registries, options("native", false, true))
    const proxy = resolveProtocolExposure(registries, options("proxy", false, false))

    expect(native.context).toMatchObject({
      resolvedMode: "native",
      nativeVisibleToolCount: 1,
      proxyCandidateToolCount: toolRegistry.definitions.length,
      proxyToolNames: []
    })
    expect(native.visibleNativeRegistry).toBe(scopedRegistry)
    expect(proxy.context).toMatchObject({
      resolvedMode: "proxy",
      nativeVisibleToolCount: 0,
      proxyCandidateToolCount: toolRegistry.definitions.length,
      proxyToolNames: ["list_tool_categories", "search_tools", "get_tool_schema", "invoke_tool"]
    })
    expect(proxy.visibleNativeRegistry.definitions).toEqual([])
  })

  it("keeps scoped native pins in non-strict proxy mode and restricts strict proxy output", () => {
    const registries = { fullRegistry: toolRegistry, scopedNativeRegistry: scopedRegistry }
    const nonStrict = resolveProtocolExposure(registries, options("proxy", false, true))
    const strict = resolveProtocolExposure(registries, options("proxy", true, true))
    const strictUnscoped = resolveProtocolExposure(registries, options("proxy", true, false))

    expect(nonStrict.visibleNativeRegistry).toBe(scopedRegistry)
    expect(nonStrict.proxyCandidateRegistry).toBe(toolRegistry)
    expect(strict.visibleNativeRegistry.definitions).toEqual([])
    expect(strict.proxyCandidateRegistry).toBe(scopedRegistry)
    expect(strictUnscoped.proxyCandidateRegistry).toBe(toolRegistry)
  })

  it("uses initialized client identity when auto-selecting the mode", () => {
    const registries = { fullRegistry: toolRegistry, scopedNativeRegistry: scopedRegistry }
    const claude = resolveProtocolExposure(registries, options("auto", false, false, "claude-code"))
    const codex = resolveProtocolExposure(registries, options("auto", false, false, "codex-cli"))
    const absent = resolveProtocolExposure(registries, options("auto", false, false))

    expect(claude.context).toMatchObject({ clientKind: "claude-code", resolvedMode: "native" })
    expect(codex.context).toMatchObject({ clientKind: "codex", resolvedMode: "proxy" })
    expect(absent.context).toMatchObject({ clientKind: "unknown", resolvedMode: "proxy" })
  })

  it("converts protocol schemas while preserving valid boolean schemas and optional fields", () => {
    const listed = toListedTool({
      name: "schema_probe",
      description: "schema probe",
      inputSchema: {
        type: "object",
        properties: { value: { type: "string" }, forbidden: false },
        required: ["value"],
        additionalProperties: false
      }
    })

    expect(listed.inputSchema).toMatchObject({
      type: "object",
      properties: { value: { type: "string" }, forbidden: false },
      required: ["value"]
    })
    expect(listed).not.toHaveProperty("outputSchema")
    expect(listed).not.toHaveProperty("annotations")

    const native = toListedHulyTool(
      toolRegistry.definitions[0] ??
        (() => {
          throw new Error("expected a registered tool")
        })()
    )
    expect(native.outputSchema).toBeDefined()
    expect(native.annotations).toBeDefined()
  })

  it("omits absent properties and rejects non-JSON schema properties", () => {
    expect(
      toListedTool({ name: "empty", description: "empty", inputSchema: { type: "object" } }).inputSchema
    ).not.toHaveProperty("properties")
    expect(() =>
      toListedTool({
        name: "malformed",
        description: "malformed",
        inputSchema: { type: "object", properties: { malformed: "not a schema" } }
      })
    ).toThrow('Tool schema property "malformed"')
    expect(() =>
      toListedTool({
        name: "non_finite",
        description: "non finite",
        inputSchema: { type: "object", properties: { malformed: { maximum: Number.POSITIVE_INFINITY } } }
      })
    ).toThrow('Tool schema property "malformed"')
    expect(() =>
      toListedTool({
        name: "callable",
        description: "callable",
        inputSchema: { type: "object", properties: { malformed: () => undefined } }
      })
    ).toThrow('Tool schema property "malformed"')
  })
})
