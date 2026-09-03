import { describe, expect, it } from "vitest"
import {
  applyErrorEnvelope,
  appendToolWarnings,
  McpErrorCode,
  type McpToolErrorResponse
} from "../../src/mcp/tool-responses.js"
import type { ToolWarning } from "../../src/domain/schemas/tool-warnings.js"

describe("applyErrorEnvelope", () => {
  it("preserves existing structuredContent and applies fallback metadata if missing", () => {
    const errorResponse: McpToolErrorResponse = {
      content: [{ type: "text", text: "Something went wrong" }],
      // @ts-expect-error adding extra stuff to check it preserves it
      structuredContent: { extraData: "some existing payload" },
      isError: true
    }
    const env = applyErrorEnvelope(errorResponse, "req-123", "2026-09-03T00:00:00.000Z")

    expect(env.structuredContent).toEqual({
      extraData: "some existing payload",
      error: {
        code: McpErrorCode.InternalError,
        name: "Error",
        layer: "server",
        timestamp: "2026-09-03T00:00:00.000Z",
        requestId: "req-123"
      }
    })
  })

  it("uses exact metadata when present", () => {
    const errorResponse: McpToolErrorResponse = {
      content: [{ type: "text", text: "Invalid parameters" }],
      _meta: { errorCode: McpErrorCode.InvalidParams, errorTag: "ValidationFailed", errorLayer: "proxy" },
      isError: true
    }
    const env = applyErrorEnvelope(errorResponse, "req-456", "2026-09-03T01:00:00.000Z")

    expect(env.structuredContent?.error).toEqual({
      code: McpErrorCode.InvalidParams,
      name: "ValidationFailed",
      layer: "proxy",
      timestamp: "2026-09-03T01:00:00.000Z",
      requestId: "req-456"
    })
  })

  it("handles empty _meta and empty structuredContent", () => {
    const errorResponse: McpToolErrorResponse = { content: [{ type: "text", text: "Error" }], isError: true }
    const env = applyErrorEnvelope(errorResponse, "req-789", "2026-09-03T02:00:00.000Z")
    expect(env.structuredContent?.error).toEqual({
      code: McpErrorCode.InternalError,
      name: "Error",
      layer: "server",
      timestamp: "2026-09-03T02:00:00.000Z",
      requestId: "req-789"
    })
  })

  it("handles partially populated _meta", () => {
    const errorResponse: McpToolErrorResponse = {
      content: [{ type: "text", text: "Error" }],
      _meta: { errorCode: McpErrorCode.InvalidParams },
      isError: true
    }
    const env = applyErrorEnvelope(errorResponse, "req-999", "2026-09-03T03:00:00.000Z")
    expect(env.structuredContent?.error).toEqual({
      code: McpErrorCode.InvalidParams,
      name: "Error",
      layer: "server",
      timestamp: "2026-09-03T03:00:00.000Z",
      requestId: "req-999"
    })
  })
})

describe("appendToolWarnings", () => {
  it("returns response unchanged if warnings is empty", () => {
    const errorResponse: McpToolErrorResponse = { content: [{ type: "text", text: "Error" }], isError: true }
    const res = appendToolWarnings(errorResponse, [])
    expect(res).toBe(errorResponse)
  })

  it("appends warnings to existing structuredContent and text content with redaction", () => {
    const warning: ToolWarning = { code: "status_metadata_unresolved", message: "token=secret" }
    const existingError = {
      code: McpErrorCode.InternalError,
      name: "SomeError",
      layer: "server",
      timestamp: "t",
      requestId: "r"
    }
    const errorResponse: McpToolErrorResponse = {
      content: [{ type: "text", text: "Error" }],
      structuredContent: { error: existingError },
      isError: true
    }
    const res = appendToolWarnings(errorResponse, [warning])

    expect(res.structuredContent).toEqual({
      error: existingError,
      warnings: [{ code: "status_metadata_unresolved", message: "token=[REDACTED]" }]
    })

    expect(res.content.length).toBe(2)
    const extraContent = res.content[1]
    if (extraContent && extraContent.type === "text") {
      expect(extraContent.text).toContain("token=[REDACTED]")
    } else {
      expect.fail("Expected second content item to be text")
    }
  })
})
