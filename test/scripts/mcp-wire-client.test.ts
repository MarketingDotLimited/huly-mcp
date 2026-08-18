import { describe, expect, it } from "vitest"

import {
  initializedNotification,
  initializeRequest,
  MCP_PROTOCOL_VERSION,
  parseMcpResponse,
  responseRequestId
} from "../../scripts/mcp-wire-client.js"

describe("Effect AI MCP wire client", () => {
  it("builds the 2025 initialize and initialized messages", () => {
    expect(initializeRequest("certification-client")).toEqual({
      id: 1,
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        capabilities: {},
        clientInfo: { name: "certification-client", version: "1.0.0" },
        protocolVersion: MCP_PROTOCOL_VERSION
      }
    })
    expect(initializedNotification()).toEqual({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })
  })

  it("parses JSON and data-framed MCP responses through the boundary schema", () => {
    const response = parseMcpResponse('event: message\ndata: {"jsonrpc":"2.0","id":7,"result":{"ok":true}}\n\n')
    expect(response).toMatchObject({ id: 7, result: { ok: true } })
    expect(responseRequestId(response)).toBe(7)
    expect(parseMcpResponse('{"jsonrpc":"2.0","id":"request","result":null}')).toMatchObject({
      id: "request",
      result: null
    })
  })

  it("rejects empty and malformed response bodies", () => {
    expect(() => parseMcpResponse("\n")).toThrow("empty")
    expect(() => parseMcpResponse("not-json")).toThrow()
  })
})
