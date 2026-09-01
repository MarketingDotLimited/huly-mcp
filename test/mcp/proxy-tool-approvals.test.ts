import { afterEach, describe, expect, it, vi } from "vitest"
import { Schema } from "effect"

import { createInvalidParamsError, createSuccessResponse, type McpToolResponse } from "../../src/mcp/error-mapping.js"
import {
  executeRegisteredToolAction,
  prepareRegisteredToolAction,
  requiresTwoStepApproval
} from "../../src/mcp/proxy-tool-approvals.js"
import { handleProxyToolCall } from "../../src/mcp/proxy-tools.js"
import type { ToolRegistry } from "../../src/mcp/tools/index.js"
import { createToolDefinition, type RegisteredTool, type ToolDefinition } from "../../src/mcp/tools/registry.js"

const input = <A>(value: unknown): A => Schema.decodeUnknownSync(Schema.Unknown)(value) as A
const client = (account = "account-a") => input({ getAccountUuid: () => account })
const clients = (account = "account-a") => input({ hulyClient: client(account), storageClient: {} })
const definition = (overrides: Partial<ToolDefinition> = {}): ToolDefinition =>
  createToolDefinition({
    name: "delete_widget",
    description: "Delete a test widget",
    category: "widgets",
    inputSchema: { type: "object", properties: {}, additionalProperties: true },
    outputSchema: { type: "object" },
    annotations: { destructiveHint: true },
    ...overrides
  })

const registry = (
  tool = definition(),
  response: unknown = createSuccessResponse({ deleted: true }),
  onCall?: () => void,
  validationError?: ReturnType<typeof createInvalidParamsError>
): ToolRegistry => {
  const registeredTool = input({ ...tool, validateInput: async () => validationError })
  return input({
    tools: new Map([[tool.name, registeredTool]]),
    definitions: [tool],
    handleToolCall: async () => {
      onCall?.()
      return response
    }
  })
}

const deletionRegistry = (
  previewResponse: McpToolResponse | null,
  onDelete?: () => void,
  targetName = "delete_issue",
  onPreview?: (args: unknown) => void
): ToolRegistry => {
  const deleteTool = input<RegisteredTool>({
    ...definition({
      name: targetName,
      category: input("issues"),
      inputSchema: {
        type: "object",
        properties: { project: { type: "string" }, identifier: { type: "string" } },
        required: ["project", "identifier"],
        additionalProperties: false
      }
    }),
    validateInput: async () => undefined
  })
  return input({
    tools: new Map([[deleteTool.name, deleteTool]]),
    definitions: [deleteTool],
    handleToolCall: async (toolName: string, args: unknown) => {
      if (toolName === "preview_deletion") {
        onPreview?.(args)
        return previewResponse
      }
      if (toolName === targetName) {
        onDelete?.()
        return createSuccessResponse({ deleted: true })
      }
      return null
    }
  })
}

const result = (response: Awaited<ReturnType<typeof prepareRegisteredToolAction>>) =>
  input<Record<string, unknown>>(response.structuredContent?.result)
const executionArgs = (response: Awaited<ReturnType<typeof prepareRegisteredToolAction>>) => {
  const prepared = result(response)
  return { approvalId: prepared.approvalId, toolName: prepared.toolName, arguments: prepared.arguments }
}

afterEach(() => vi.unstubAllEnvs())

describe("registered tool approvals", () => {
  it("classifies destructive and high-impact tools without blocking ordinary writes", () => {
    expect(requiresTwoStepApproval(definition())).toBe(true)
    expect(requiresTwoStepApproval(definition({ name: "delete_anything", annotations: {} }))).toBe(true)
    expect(
      requiresTwoStepApproval(
        definition({ name: "create_role", category: input("security-administration"), annotations: {} })
      )
    ).toBe(true)
    expect(
      requiresTwoStepApproval(definition({ name: "create_workspace", category: input("projects"), annotations: {} }))
    ).toBe(true)
    expect(
      requiresTwoStepApproval(definition({ name: "update_widget", annotations: { destructiveHint: false } }))
    ).toBe(false)
    expect(
      requiresTwoStepApproval(
        definition({
          name: "get_workspace_info",
          category: input("workspace"),
          annotations: { readOnlyHint: true, destructiveHint: false }
        })
      )
    ).toBe(false)
    expect(
      requiresTwoStepApproval(
        definition({
          name: "get_class_collaborator_metadata",
          category: input("security-administration"),
          annotations: { readOnlyHint: true, destructiveHint: false }
        })
      )
    ).toBe(false)
  })

  it("validates target arguments before creating an approval", async () => {
    const validationError = createInvalidParamsError(
      "Invalid parameters for delete_widget: identifier: is missing",
      "InvalidParams"
    )
    const prepared = await prepareRegisteredToolAction(
      input({
        toolName: "prepare_tool_action",
        args: { toolName: "delete_widget", arguments: {} },
        registry: registry(definition(), createSuccessResponse({ deleted: true }), undefined, validationError),
        clients: clients(),
        currentTimeMillis: 1_000
      })
    )

    expect(prepared).toMatchObject({ isError: true })
    expect(prepared.content[0]).toMatchObject({
      type: "text",
      text: "Invalid parameters for delete_widget: identifier: is missing"
    })
  })

  it("rejects approval when deletion preflight proves the target does not exist", async () => {
    const target = deletionRegistry(createInvalidParamsError("Issue 'TSK-999999999' not found", "NotFound"))
    const prepared = await prepareRegisteredToolAction(
      input({
        toolName: "prepare_tool_action",
        args: { toolName: "delete_issue", arguments: { project: "TSK", identifier: "TSK-999999999" } },
        registry: target,
        clients: clients(),
        currentTimeMillis: 1_000
      })
    )

    expect(prepared).toMatchObject({ isError: true })
    expect(prepared.content[0]).toMatchObject({ type: "text", text: "Issue 'TSK-999999999' not found" })
    expect(prepared.structuredContent?.result).toBeUndefined()
  })

  it("returns a verified deletion preview and executes the exact approved target", async () => {
    let deletionCalls = 0
    const preview = {
      entityType: "issue",
      identifier: "TSK-7",
      impact: { comments: 1 },
      warnings: ["Has 1 comment that will be deleted"],
      totalAffected: 1
    }
    const target = deletionRegistry(createSuccessResponse(preview), () => {
      deletionCalls += 1
    })
    const prepared = await prepareRegisteredToolAction(
      input({
        toolName: "prepare_tool_action",
        args: { toolName: "delete_issue", arguments: { project: "TSK", identifier: "TSK-7" } },
        registry: target,
        clients: clients(),
        currentTimeMillis: 1_000
      })
    )

    expect(result(prepared).preflight).toEqual(preview)
    const executed = await executeRegisteredToolAction(
      input({
        toolName: "execute_approved_tool_action",
        args: executionArgs(prepared),
        registry: target,
        clients: clients(),
        currentTimeMillis: 1_001
      })
    )
    expect(executed.isError).not.toBe(true)
    expect(deletionCalls).toBe(1)
  })

  it("maps every preview-supported deletion to the canonical live preflight", async () => {
    const cases: ReadonlyArray<{
      readonly toolName: string
      readonly arguments: Readonly<Record<string, string>>
      readonly expectedPreview: Readonly<Record<string, string>>
    }> = [
      {
        toolName: "delete_project",
        arguments: { project: "TSK" },
        expectedPreview: { entityType: "project", project: "TSK" }
      },
      {
        toolName: "delete_component",
        arguments: { project: "TSK", component: "Frontend" },
        expectedPreview: { entityType: "component", project: "TSK", identifier: "Frontend" }
      },
      {
        toolName: "delete_milestone",
        arguments: { project: "TSK", milestone: "M1" },
        expectedPreview: { entityType: "milestone", project: "TSK", identifier: "M1" }
      }
    ]

    for (const testCase of cases) {
      let previewArgs: unknown
      const target = deletionRegistry(createSuccessResponse({ exists: true }), undefined, testCase.toolName, (args) => {
        previewArgs = args
      })
      const prepared = await prepareRegisteredToolAction(
        input({
          toolName: "prepare_tool_action",
          args: { toolName: testCase.toolName, arguments: testCase.arguments },
          registry: target,
          clients: clients(),
          currentTimeMillis: 1_000
        })
      )

      expect(prepared.isError).not.toBe(true)
      expect(previewArgs).toEqual(testCase.expectedPreview)
    }
  })

  it("fails closed when a preview-supported deletion cannot run its preflight", async () => {
    const prepared = await prepareRegisteredToolAction(
      input({
        toolName: "prepare_tool_action",
        args: { toolName: "delete_issue", arguments: { project: "TSK", identifier: "TSK-7" } },
        registry: deletionRegistry(null),
        clients: clients(),
        currentTimeMillis: 1_000
      })
    )

    expect(prepared).toMatchObject({ isError: true })
    expect(prepared.content[0]).toMatchObject({
      type: "text",
      text: "Approval preflight for 'delete_issue' is unavailable because preview_deletion is not registered."
    })
  })

  it("preserves a successful legacy deletion-preview payload without structured content", async () => {
    const legacyPreview = input<McpToolResponse>({ content: [{ type: "text", text: "legacy deletion preview" }] })
    const prepared = await prepareRegisteredToolAction(
      input({
        toolName: "prepare_tool_action",
        args: { toolName: "delete_issue", arguments: { project: "TSK", identifier: "TSK-7" } },
        registry: deletionRegistry(legacyPreview),
        clients: clients(),
        currentTimeMillis: 1_000
      })
    )

    expect(result(prepared).preflight).toEqual(legacyPreview.content)
  })

  it("prepares canonical argument hashes and executes a token once", async () => {
    const target = registry()
    const first = await prepareRegisteredToolAction(
      input({
        toolName: "prepare_tool_action",
        args: { toolName: "delete_widget", arguments: { z: 1, a: { y: 2, x: 1 } } },
        registry: target,
        clients: clients(),
        currentTimeMillis: 1_000
      })
    )
    const second = await prepareRegisteredToolAction(
      input({
        toolName: "prepare_tool_action",
        args: { toolName: "delete_widget", arguments: { a: { x: 1, y: 2 }, z: 1 } },
        registry: target,
        clients: clients(),
        currentTimeMillis: 1_000
      })
    )
    expect(result(first).argumentsHash).toBe(result(second).argumentsHash)
    const executed = await executeRegisteredToolAction(
      input({
        toolName: "execute_approved_tool_action",
        args: executionArgs(first),
        registry: target,
        clients: clients(),
        currentTimeMillis: 1_001
      })
    )
    expect(executed.structuredContent?.result).toMatchObject({ toolName: "delete_widget", result: { deleted: true } })
    const replay = await executeRegisteredToolAction(
      input({
        toolName: "execute_approved_tool_action",
        args: executionArgs(first),
        registry: target,
        clients: clients(),
        currentTimeMillis: 1_002
      })
    )
    expect(replay.isError).toBe(true)
  })

  it("normalizes deferred JSON arguments before dispatch", async () => {
    let received: unknown
    const target = input<ToolRegistry>({
      ...registry(),
      handleToolCall: async (_name: string, args: unknown) => {
        received = args
        return createSuccessResponse({ ok: true })
      }
    })
    const prepared = await prepareRegisteredToolAction(
      input({
        toolName: "prepare_tool_action",
        args: { toolName: "delete_widget", arguments: '{"id":"one"}' },
        registry: target,
        clients: clients(),
        currentTimeMillis: 2_000
      })
    )
    await executeRegisteredToolAction(
      input({
        toolName: "execute_approved_tool_action",
        args: executionArgs(prepared),
        registry: target,
        clients: clients(),
        currentTimeMillis: 2_001
      })
    )
    expect(received).toEqual({ id: "one" })
    const invalidJson = await prepareRegisteredToolAction(
      input({
        toolName: "prepare_tool_action",
        args: { toolName: "delete_widget", arguments: "{" },
        registry: target,
        clients: clients(),
        currentTimeMillis: 2_100
      })
    )
    await executeRegisteredToolAction(
      input({
        toolName: "execute_approved_tool_action",
        args: executionArgs(invalidJson),
        registry: target,
        clients: clients(),
        currentTimeMillis: 2_101
      })
    )
    expect(received).toBe("{")
    const arrayArgs = await prepareRegisteredToolAction(
      input({
        toolName: "prepare_tool_action",
        args: { toolName: "delete_widget", arguments: [{ b: 2, a: 1 }] },
        registry: target,
        clients: clients(),
        currentTimeMillis: 2_200
      })
    )
    expect(result(arrayArgs).argumentsHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("requires inspectable execution details to match the prepared action", async () => {
    let calls = 0
    const target = registry(definition(), createSuccessResponse({ deleted: true }), () => {
      calls += 1
    })
    const changedArguments = await prepareRegisteredToolAction(
      input({
        toolName: "prepare_tool_action",
        args: { toolName: "delete_widget", arguments: { id: "one" } },
        registry: target,
        clients: clients(),
        currentTimeMillis: 1
      })
    )
    const argumentsMismatch = await executeRegisteredToolAction(
      input({
        toolName: "execute_approved_tool_action",
        args: { ...executionArgs(changedArguments), arguments: { id: "two" } },
        registry: target,
        clients: clients(),
        currentTimeMillis: 2
      })
    )
    expect(argumentsMismatch).toMatchObject({ isError: true, _meta: { errorTag: "ApprovalMismatch" } })

    const changedTool = await prepareRegisteredToolAction(
      input({
        toolName: "prepare_tool_action",
        args: { toolName: "delete_widget", arguments: { id: "one" } },
        registry: target,
        clients: clients(),
        currentTimeMillis: 3
      })
    )
    const toolMismatch = await executeRegisteredToolAction(
      input({
        toolName: "execute_approved_tool_action",
        args: { ...executionArgs(changedTool), toolName: "delete_other_widget" },
        registry: target,
        clients: clients(),
        currentTimeMillis: 4
      })
    )
    expect(toolMismatch).toMatchObject({ isError: true, _meta: { errorTag: "ApprovalMismatch" } })
    expect(calls).toBe(0)
  })

  it("rejects missing context, invalid inputs, unknown tools, and unnecessary approvals", async () => {
    const target = registry()
    expect(
      (await prepareRegisteredToolAction(input({ toolName: "prepare_tool_action", args: {}, registry: target })))
        .isError
    ).toBe(true)
    expect(
      (
        await prepareRegisteredToolAction(
          input({ toolName: "prepare_tool_action", args: {}, registry: target, clients: clients() })
        )
      ).isError
    ).toBe(true)
    expect(
      (
        await prepareRegisteredToolAction(
          input({ toolName: "prepare_tool_action", registry: target, clients: clients(), currentTimeMillis: 1 })
        )
      ).isError
    ).toBe(true)
    expect(
      (
        await prepareRegisteredToolAction(
          input({
            toolName: "prepare_tool_action",
            args: { toolName: "" },
            registry: target,
            clients: clients(),
            currentTimeMillis: 1
          })
        )
      ).isError
    ).toBe(true)
    expect(
      (
        await prepareRegisteredToolAction(
          input({
            toolName: "prepare_tool_action",
            args: { toolName: "missing" },
            registry: target,
            clients: clients(),
            currentTimeMillis: 1
          })
        )
      ).isError
    ).toBe(true)
    const safe = definition({ name: "update_widget", annotations: { destructiveHint: false } })
    expect(
      (
        await prepareRegisteredToolAction(
          input({
            toolName: "prepare_tool_action",
            args: { toolName: "update_widget" },
            registry: registry(safe),
            clients: clients(),
            currentTimeMillis: 1
          })
        )
      ).isError
    ).toBe(true)
    expect(
      (
        await executeRegisteredToolAction(
          input({ toolName: "execute_approved_tool_action", args: {}, registry: target })
        )
      ).isError
    ).toBe(true)
    expect(
      (
        await executeRegisteredToolAction(
          input({ toolName: "execute_approved_tool_action", args: {}, registry: target, clients: clients() })
        )
      ).isError
    ).toBe(true)
    expect(
      (
        await executeRegisteredToolAction(
          input({
            toolName: "execute_approved_tool_action",
            registry: target,
            clients: clients(),
            currentTimeMillis: 1
          })
        )
      ).isError
    ).toBe(true)
    expect(
      (
        await executeRegisteredToolAction(
          input({
            toolName: "execute_approved_tool_action",
            args: { approvalId: "", toolName: "delete_widget", arguments: {} },
            registry: target,
            clients: clients(),
            currentTimeMillis: 1
          })
        )
      ).isError
    ).toBe(true)
    expect(
      (
        await executeRegisteredToolAction(
          input({
            toolName: "execute_approved_tool_action",
            args: { approvalId: "missing", toolName: "delete_widget", arguments: {} },
            registry: target,
            clients: clients(),
            currentTimeMillis: 1
          })
        )
      ).isError
    ).toBe(true)
  })

  it("rejects expired and cross-account tokens", async () => {
    const target = registry()
    const expired = await prepareRegisteredToolAction(
      input({
        toolName: "prepare_tool_action",
        args: { toolName: "delete_widget" },
        registry: target,
        clients: clients(),
        currentTimeMillis: 1
      })
    )
    expect(
      (
        await executeRegisteredToolAction(
          input({
            toolName: "execute_approved_tool_action",
            args: executionArgs(expired),
            registry: target,
            clients: clients(),
            currentTimeMillis: 400_000
          })
        )
      ).isError
    ).toBe(true)
    const bound = await prepareRegisteredToolAction(
      input({
        toolName: "prepare_tool_action",
        args: { toolName: "delete_widget" },
        registry: target,
        clients: clients(),
        currentTimeMillis: 1
      })
    )
    expect(
      (
        await executeRegisteredToolAction(
          input({
            toolName: "execute_approved_tool_action",
            args: executionArgs(bound),
            registry: target,
            clients: clients("account-b"),
            currentTimeMillis: 2
          })
        )
      ).isError
    ).toBe(true)
  })

  it("passes through target errors and handles a missing target at execution", async () => {
    const errorTarget = registry(definition(), createInvalidParamsError("target failed", "TargetFailed"))
    const failed = await prepareRegisteredToolAction(
      input({
        toolName: "prepare_tool_action",
        args: { toolName: "delete_widget" },
        registry: errorTarget,
        clients: clients(),
        currentTimeMillis: 1
      })
    )
    expect(
      (
        await executeRegisteredToolAction(
          input({
            toolName: "execute_approved_tool_action",
            args: executionArgs(failed),
            registry: errorTarget,
            clients: clients(),
            currentTimeMillis: 2
          })
        )
      ).isError
    ).toBe(true)
    const contentOnly = registry(definition(), input({ content: [{ type: "text", text: "done" }] }))
    const contentPrepared = await prepareRegisteredToolAction(
      input({
        toolName: "prepare_tool_action",
        args: { toolName: "delete_widget" },
        registry: contentOnly,
        clients: clients(),
        currentTimeMillis: 10
      })
    )
    expect(
      (
        await executeRegisteredToolAction(
          input({
            toolName: "execute_approved_tool_action",
            args: executionArgs(contentPrepared),
            registry: contentOnly,
            clients: clients(),
            currentTimeMillis: 11
          })
        )
      ).isError
    ).not.toBe(true)
    const withImageAndWarnings = registry(
      definition(),
      input({
        content: [{ type: "text", text: "done" }],
        structuredContent: { result: { ok: true }, warnings: [{ code: "test", message: "warning" }] },
        imageContent: { type: "image", data: "AA==", mimeType: "image/png" }
      })
    )
    const imagePrepared = await prepareRegisteredToolAction(
      input({
        toolName: "prepare_tool_action",
        args: { toolName: "delete_widget" },
        registry: withImageAndWarnings,
        clients: clients(),
        currentTimeMillis: 20
      })
    )
    const imageResponse = await executeRegisteredToolAction(
      input({
        toolName: "execute_approved_tool_action",
        args: executionArgs(imagePrepared),
        registry: withImageAndWarnings,
        clients: clients(),
        currentTimeMillis: 21
      })
    )
    expect(Reflect.get(imageResponse, "imageContent")).toMatchObject({ mimeType: "image/png" })
    const missingAtExecution = input<ToolRegistry>({ ...registry(), handleToolCall: async () => null })
    const missing = await prepareRegisteredToolAction(
      input({
        toolName: "prepare_tool_action",
        args: { toolName: "delete_widget" },
        registry: missingAtExecution,
        clients: clients(),
        currentTimeMillis: 1
      })
    )
    expect(
      (
        await executeRegisteredToolAction(
          input({
            toolName: "execute_approved_tool_action",
            args: executionArgs(missing),
            registry: missingAtExecution,
            clients: clients(),
            currentTimeMillis: 2
          })
        )
      ).isError
    ).toBe(true)
  })

  it("fails closed on missing audit storage and reports completion-audit failure accurately", async () => {
    vi.stubEnv("HULY_AUDIT_LOG_PATH", "/proc")
    expect(
      (
        await prepareRegisteredToolAction(
          input({
            toolName: "prepare_tool_action",
            args: { toolName: "delete_widget" },
            registry: registry(),
            clients: clients(),
            currentTimeMillis: 1
          })
        )
      ).isError
    ).toBe(true)
    vi.unstubAllEnvs()
    const startFailurePrepared = await prepareRegisteredToolAction(
      input({
        toolName: "prepare_tool_action",
        args: { toolName: "delete_widget" },
        registry: registry(),
        clients: clients(),
        currentTimeMillis: 1
      })
    )
    vi.stubEnv("HULY_AUDIT_LOG_PATH", "/proc")
    expect(
      (
        await executeRegisteredToolAction(
          input({
            toolName: "execute_approved_tool_action",
            args: executionArgs(startFailurePrepared),
            registry: registry(),
            clients: clients(),
            currentTimeMillis: 2
          })
        )
      )._meta
    ).toMatchObject({ errorTag: "AuditUnavailable" })
    vi.unstubAllEnvs()
    const target = registry(definition(), createSuccessResponse({ deleted: true }), () => {
      vi.stubEnv("HULY_AUDIT_LOG_PATH", "/proc")
    })
    const prepared = await prepareRegisteredToolAction(
      input({
        toolName: "prepare_tool_action",
        args: { toolName: "delete_widget" },
        registry: target,
        clients: clients(),
        currentTimeMillis: 1
      })
    )
    const response = await executeRegisteredToolAction(
      input({
        toolName: "execute_approved_tool_action",
        args: executionArgs(prepared),
        registry: target,
        clients: clients(),
        currentTimeMillis: 2
      })
    )
    expect(response).toMatchObject({ isError: true, _meta: { errorTag: "AuditCompletionUnavailable" } })
  })

  it("routes approval and rejection through the proxy dispatcher", async () => {
    const target = registry()
    expect(
      (
        await handleProxyToolCall(
          input({
            toolName: "invoke_tool",
            args: { toolName: "delete_widget", arguments: {} },
            proxyCandidateRegistry: target,
            clients: clients(),
            currentTimeMillis: 100
          })
        )
      )._meta
    ).toMatchObject({ errorTag: "ApprovalRequired" })
    const prepared = await handleProxyToolCall(
      input({
        toolName: "prepare_tool_action",
        args: { toolName: "delete_widget", arguments: {} },
        proxyCandidateRegistry: target,
        clients: clients(),
        currentTimeMillis: 100
      })
    )
    const executed = await handleProxyToolCall(
      input({
        toolName: "execute_approved_tool_action",
        args: executionArgs(prepared),
        proxyCandidateRegistry: target,
        clients: clients(),
        currentTimeMillis: 101
      })
    )
    expect(executed.isError).not.toBe(true)
    expect(
      (
        await handleProxyToolCall(
          input({
            toolName: "prepare_tool_action",
            args: { toolName: "delete_widget" },
            proxyCandidateRegistry: target,
            currentTimeMillis: 100
          })
        )
      ).isError
    ).toBe(true)
    expect(
      (
        await handleProxyToolCall(
          input({
            toolName: "prepare_tool_action",
            args: { toolName: "delete_widget" },
            proxyCandidateRegistry: target,
            clients: clients()
          })
        )
      ).isError
    ).toBe(true)
    expect(
      (
        await handleProxyToolCall(
          input({
            toolName: "execute_approved_tool_action",
            args: { approvalId: "missing", toolName: "delete_widget", arguments: {} },
            proxyCandidateRegistry: target,
            clients: clients()
          })
        )
      ).isError
    ).toBe(true)
    expect(
      (
        await handleProxyToolCall(
          input({
            toolName: "execute_approved_tool_action",
            args: { approvalId: "missing", toolName: "delete_widget", arguments: {} },
            proxyCandidateRegistry: target,
            currentTimeMillis: 100
          })
        )
      ).isError
    ).toBe(true)
  })
})
