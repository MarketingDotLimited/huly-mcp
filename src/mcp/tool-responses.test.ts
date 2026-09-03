import { describe, expect, it } from "vitest"
import {
  createErrorResponse,
  McpErrorCode,
  appendToolWarnings,
  redactErrorText,
  type McpToolResponse
} from "./tool-responses.js"
import { HostedHulyShutdownWarningCode } from "../domain/schemas/tool-warnings.js"

describe("tool-responses", () => {
  it("redacts bearer tokens and secrets", () => {
    const text =
      'Failed with Bearer secret-123 and token=abc1234&password=pw and "secret": "123" and authorization: my_token and token:\'abc\''
    const redacted = redactErrorText(text)

    // Exact structural check
    expect(redacted).toBe(
      'Failed with Bearer [REDACTED] and token=[REDACTED]&password=[REDACTED] and "secret": "[REDACTED]" and authorization: [REDACTED] and token:\'[REDACTED]\''
    )

    // Explicit assertion that no original secret values occur
    expect(redacted).not.toContain("secret-123")
    expect(redacted).not.toContain("abc1234")
    expect(redacted).not.toContain("pw")
    expect(redacted).not.toContain("123")
    expect(redacted).not.toContain("my_token")
    expect(redacted).not.toContain("abc")
  })

  it("does not redact approval IDs", () => {
    const text = "Approval required for approvalId=app_12345"
    const redacted = redactErrorText(text)
    expect(redacted).toBe(text)
  })

  it("appends tool warnings to error responses while preserving legacy content-only format", () => {
    const errorResponse = createErrorResponse("Error occurred", McpErrorCode.InternalError, "SomeTag")
    expect(errorResponse.structuredContent).toBeUndefined()

    const withWarning = appendToolWarnings(errorResponse, [
      { code: HostedHulyShutdownWarningCode, message: "First warning with password=123" }
    ])
    expect(withWarning.content.length).toBe(2)
    expect(withWarning.content[1]?.text).toContain("First warning with password=[REDACTED]")
    expect(withWarning.structuredContent).toBeUndefined()
    expect(withWarning._meta).toEqual(errorResponse._meta)

    // With existing structuredContent (e.g., envelope injected)
    const withEnvelope: McpToolResponse = {
      ...errorResponse,
      isError: true as const,
      structuredContent: { error: { code: 1, name: "A", layer: "B", timestamp: "C", requestId: "D" } }
    }
    const withSecond = appendToolWarnings(withEnvelope, [
      { code: HostedHulyShutdownWarningCode, message: "Second warning" }
    ])
    expect(withSecond.structuredContent?.error?.name).toBe("A")
    expect(withSecond.structuredContent?.warnings).toEqual([
      { code: HostedHulyShutdownWarningCode, message: "Second warning" }
    ])
  })
})
