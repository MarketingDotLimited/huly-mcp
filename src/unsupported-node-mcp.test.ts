import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  handleUnsupportedNodeRequest,
  isUnsupportedNodeRuntime,
  parseUnsupportedNodeMcpConfig,
  renderUnsupportedNodeDiagnostic
} from "./unsupported-node-mcp.js"

const config = parseUnsupportedNodeMcpConfig({
  detectedNodeVersion: "20.20.1",
  executable: "/usr/local/bin/node",
  requiredNodeVersion: ">=22.19.0",
  serverVersion: "1.2.3"
})

const ResponseSchema = Schema.fromJsonString(
  Schema.Struct({
    jsonrpc: Schema.Literal("2.0"),
    id: Schema.Union([Schema.String, Schema.Number, Schema.Null]),
    result: Schema.optionalKey(Schema.Json),
    error: Schema.optionalKey(Schema.Struct({ code: Schema.Number, message: Schema.String }))
  })
)

const decodeResponse = (response: string | undefined) => Schema.decodeUnknownSync(ResponseSchema)(response)

describe("unsupported Node MCP", () => {
  it("parses runtime facts and derives one consistent remediation", () => {
    expect(config).toEqual({
      detectedNodeVersion: "20.20.1",
      executable: "/usr/local/bin/node",
      requiredNodeVersion: ">=22.19.0",
      serverVersion: "1.2.3"
    })
    expect(renderUnsupportedNodeDiagnostic(config)).toContain(
      "Detected 20.20.1 at /usr/local/bin/node; required >=22.19.0"
    )
    expect(() => parseUnsupportedNodeMcpConfig({ ...config, executable: "" })).toThrow()
    expect(() => parseUnsupportedNodeMcpConfig({ ...config, detectedNodeVersion: "twenty" })).toThrow()
    expect(() => parseUnsupportedNodeMcpConfig({ ...config, requiredNodeVersion: "^22.19.0" })).toThrow()
  })

  it.each([
    ["20.20.1", ">=22.19.0", true],
    ["22.18.9", ">=22.19.0", true],
    ["22.19.0", ">=22.19.0", false],
    ["22.19.1", ">=22.19.0", false],
    ["23.0.0", ">=22.19.0", false],
    ["invalid", ">=22.19.0", true],
    ["20.20.1", "^22.19.0", true],
    ["20.20.1", ">=invalid", true],
    ["1000000000.0.0", ">=22.19.0", true]
  ])("classifies Node %s against %s", (actual, requirement, expected) => {
    expect(isUnsupportedNodeRuntime(actual, requirement)).toBe(expected)
  })

  it("places the diagnostic in initialize instructions", () => {
    const response = decodeResponse(
      handleUnsupportedNodeRequest(
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }),
        config
      )
    )
    expect(response.result).toMatchObject({
      instructions: expect.stringContaining("unsupported Node.js runtime"),
      protocolVersion: "2025-06-18",
      serverInfo: { name: "huly-mcp", version: "1.2.3" }
    })
  })

  it("advertises and invokes the diagnostic tool", () => {
    const listed = decodeResponse(
      handleUnsupportedNodeRequest(JSON.stringify({ jsonrpc: "2.0", id: "list", method: "tools/list" }), config)
    )
    expect(listed.result).toMatchObject({
      tools: [{ description: expect.stringContaining("required >=22.19.0"), name: "get_huly_startup_diagnostic" }]
    })

    const called = decodeResponse(
      handleUnsupportedNodeRequest(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "get_huly_startup_diagnostic" }
        }),
        config
      )
    )
    expect(called.result).toMatchObject({
      isError: true,
      structuredContent: {
        error: { code: "UNSUPPORTED_NODE_RUNTIME", detectedNodeVersion: "20.20.1", requiredNodeVersion: ">=22.19.0" }
      }
    })
  })

  it.each([
    ["not json", -32700, null],
    [JSON.stringify({ jsonrpc: "2.0", id: 3, method: "unknown" }), -32601, 3],
    [JSON.stringify({ jsonrpc: "2.0", id: 4, method: "initialize", params: {} }), -32600, 4],
    [JSON.stringify({ jsonrpc: "2.0", method: "initialize", params: { protocolVersion: "v" } }), -32600, null],
    [JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: {} }), -32600, 5],
    [JSON.stringify({ jsonrpc: "2.0", method: "tools/call", params: { name: "other" } }), -32600, null],
    [JSON.stringify({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "other" } }), -32602, 6]
  ])("returns a typed protocol error for %s", (request, code, id) => {
    expect(decodeResponse(handleUnsupportedNodeRequest(request, config))).toMatchObject({ error: { code }, id })
  })

  it("handles ping and ignores notifications", () => {
    expect(
      decodeResponse(handleUnsupportedNodeRequest(JSON.stringify({ jsonrpc: "2.0", id: 7, method: "ping" }), config))
    ).toMatchObject({ id: 7, result: {} })
    expect(handleUnsupportedNodeRequest(JSON.stringify({ jsonrpc: "2.0", method: "ping" }), config)).toBeUndefined()
    expect(
      handleUnsupportedNodeRequest(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }), config)
    ).toBeUndefined()
    expect(
      handleUnsupportedNodeRequest(JSON.stringify({ jsonrpc: "2.0", method: "tools/list" }), config)
    ).toBeUndefined()
    expect(handleUnsupportedNodeRequest(JSON.stringify({ jsonrpc: "2.0", method: "unknown" }), config)).toBeUndefined()
  })
})
