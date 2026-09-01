import { createHash, randomUUID } from "node:crypto"
import { appendFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import type { ToolAnnotations } from "@modelcontextprotocol/server"
import { Result, Schema } from "effect"

import type { HulyStorageClient } from "../huly/storage.js"
import type { WorkspaceClientOperations } from "../huly/workspace-client.js"
import {
  createImageSuccessResponse,
  createInvalidParamsError,
  createSuccessResponse,
  createUnknownToolError,
  mapParseErrorToMcp,
  type McpToolResponse
} from "./error-mapping.js"
import type { ToolRegistry } from "./tools/index.js"
import { resolveAnnotations, ToolDescription, type ToolDefinition, ToolName } from "./tools/registry.js"

const MINUTES_PER_APPROVAL = 5
const MILLISECONDS_PER_MINUTE = 60_000
const TOOL_APPROVAL_TTL_MS = MINUTES_PER_APPROVAL * MILLISECONDS_PER_MINUTE

export const PrepareToolActionParamsSchema = Schema.Struct({
  toolName: ToolName,
  arguments: Schema.optionalKey(Schema.Unknown)
})
export const ExecuteToolActionParamsSchema = Schema.Struct({
  approvalId: ToolName,
  toolName: ToolName,
  arguments: Schema.Unknown
})
export const PrepareToolActionResultSchema = Schema.Struct({
  approvalId: ToolName,
  expiresAt: Schema.Number,
  toolName: ToolName,
  arguments: Schema.Unknown,
  argumentsHash: ToolName,
  warning: ToolDescription
})
export const ExecutedToolActionResultSchema = Schema.Struct({
  toolName: ToolName,
  result: Schema.Unknown,
  warnings: Schema.optionalKey(Schema.Array(Schema.Unknown))
})

export const prepareToolActionInputSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    toolName: { type: "string", minLength: 1, description: "Exact high-impact Huly tool name to preview." },
    arguments: { description: "Exact target-tool arguments that will be bound to the approval ID." }
  },
  required: ["toolName"],
  additionalProperties: false
} satisfies ToolDefinition["inputSchema"]

export const executeToolActionInputSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    approvalId: {
      type: "string",
      minLength: 1,
      description: "Single-use approval record identifier from prepare_tool_action. This is not a credential."
    },
    toolName: { type: "string", minLength: 1, description: "Exact target tool name returned by prepare_tool_action." },
    arguments: {
      description:
        "Exact target arguments returned by prepare_tool_action. The server rejects any change from the prepared action."
    }
  },
  required: ["approvalId", "toolName", "arguments"],
  additionalProperties: false
} satisfies ToolDefinition["inputSchema"]

const HIGH_IMPACT_CATEGORIES = new Set([
  "model-administration",
  "security-administration",
  "sequence-administration",
  "workspace"
])
const HIGH_IMPACT_TOOLS = new Set(["create_workspace", "update_member_role", "remove_workspace_member"])

export const requiresTwoStepApproval = (tool: ToolDefinition): boolean => {
  const annotations = resolveAnnotations(tool)
  if (annotations.readOnlyHint === true) return false
  return (
    tool.annotations?.destructiveHint === true ||
    tool.name.startsWith("delete_") ||
    HIGH_IMPACT_CATEGORIES.has(tool.category) ||
    HIGH_IMPACT_TOOLS.has(tool.name)
  )
}

export interface ToolApprovalClients {
  readonly hulyClient: Parameters<ToolRegistry["handleToolCall"]>[2]
  readonly storageClient: HulyStorageClient["Service"]
  readonly workspaceClient?: WorkspaceClientOperations
}

interface PreparedToolAction {
  readonly accountUuid: string
  readonly args: unknown
  readonly argumentsHash: ToolName
  readonly expiresAt: number
  readonly toolName: ToolName
}

const preparedToolActions = new Map<string, PreparedToolAction>()
const DeferredToolArgumentsJsonSchema = Schema.fromJsonString(Schema.Unknown)

const normalizeArguments = (value: unknown): unknown => {
  if (value === undefined) return {}
  if (typeof value !== "string") return value
  const decoded = Schema.decodeUnknownResult(DeferredToolArgumentsJsonSchema)(value)
  return Result.isSuccess(decoded) ? decoded.success : value
}

const canonicalize = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonicalize)
    : typeof value === "object" && value !== null
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, canonicalize(item)])
        )
      : value

const argumentsHash = (args: unknown): ToolName =>
  ToolName.make(
    createHash("sha256")
      .update(JSON.stringify(canonicalize(normalizeArguments(args))))
      .digest("hex")
  )

const auditPath = (): string => process.env["HULY_AUDIT_LOG_PATH"] ?? "/tmp/huly-mcp-audit/mutations.jsonl"

const appendApprovalAudit = async (event: Readonly<Record<string, unknown>>): Promise<boolean> => {
  const path = auditPath()
  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    await appendFile(path, JSON.stringify(event) + "\n", { encoding: "utf8", mode: 0o600 })
    return true
  } catch {
    return false
  }
}

const successfulResponse = (toolName: ToolName, response: Exclude<McpToolResponse, { readonly isError: true }>) => {
  const warnings = response.structuredContent?.warnings ?? []
  const result = {
    toolName,
    result: response.structuredContent?.result ?? response.content,
    ...(warnings.length === 0 ? {} : { warnings })
  }
  return response.imageContent === undefined
    ? createSuccessResponse(result, warnings)
    : createImageSuccessResponse(result, response.imageContent, warnings)
}

interface ApprovalInput {
  readonly args: unknown
  readonly clients?: ToolApprovalClients
  readonly currentTimeMillis?: number
  readonly registry: ToolRegistry
  readonly toolName: ToolName
}

type InitializedApprovalInput = ApprovalInput & {
  readonly clients: ToolApprovalClients
  readonly currentTimeMillis: number
}

type ConsumedApproval =
  | { readonly _tag: "Success"; readonly prepared: PreparedToolAction }
  | { readonly _tag: "Failure"; readonly response: McpToolResponse }

const consumeApproval = (input: InitializedApprovalInput, token: string): ConsumedApproval => {
  const prepared = preparedToolActions.get(token)
  preparedToolActions.delete(token)
  if (prepared === undefined) {
    return {
      _tag: "Failure",
      response: createInvalidParamsError("Approval ID is invalid or already used.", "ApprovalInvalid")
    }
  }
  if (prepared.expiresAt < input.currentTimeMillis) {
    return { _tag: "Failure", response: createInvalidParamsError("Approval ID has expired.", "ApprovalExpired") }
  }
  if (prepared.accountUuid !== String(input.clients.hulyClient.getAccountUuid())) {
    return {
      _tag: "Failure",
      response: createInvalidParamsError("Approval ID belongs to a different Huly account.", "ApprovalAccountMismatch")
    }
  }
  return { _tag: "Success", prepared }
}

const matchesPreparedAction = (prepared: PreparedToolAction, toolName: ToolName, args: unknown): boolean =>
  prepared.toolName === toolName && prepared.argumentsHash === argumentsHash(args)

type ApprovalTargetValidation =
  | { readonly _tag: "Success"; readonly args: unknown }
  | { readonly _tag: "Failure"; readonly response: McpToolResponse }

const validateApprovalTarget = async (
  registry: ToolRegistry,
  toolName: ToolName,
  args: unknown
): Promise<ApprovalTargetValidation> => {
  const target = registry.tools.get(toolName)
  if (target === undefined) return { _tag: "Failure", response: createUnknownToolError(toolName) }
  if (!requiresTwoStepApproval(target)) {
    return {
      _tag: "Failure",
      response: createInvalidParamsError(
        `Tool '${toolName}' does not require two-step approval.`,
        "ApprovalNotRequired"
      )
    }
  }
  const normalized = normalizeArguments(args)
  const validationError = await target.validateInput(normalized)
  return validationError === undefined
    ? { _tag: "Success", args: normalized }
    : { _tag: "Failure", response: validationError }
}

const auditExecution = (
  prepared: PreparedToolAction,
  timestamp: number,
  event: "registered_tool_execution_started" | "registered_tool_executed"
): Promise<boolean> =>
  appendApprovalAudit({
    event,
    timestamp,
    accountUuid: prepared.accountUuid,
    toolName: prepared.toolName,
    argumentsHash: prepared.argumentsHash,
    ...(event === "registered_tool_executed" ? { outcome: "success" } : {})
  })

const executePreparedAction = async (
  input: InitializedApprovalInput,
  prepared: PreparedToolAction
): Promise<McpToolResponse> => {
  const started = await auditExecution(prepared, input.currentTimeMillis, "registered_tool_execution_started")
  if (!started) {
    return createInvalidParamsError("Mutation audit log is unavailable; action was not executed.", "AuditUnavailable")
  }
  const response = await input.registry.handleToolCall(
    prepared.toolName,
    prepared.args,
    input.clients.hulyClient,
    input.clients.storageClient,
    input.clients.workspaceClient
  )
  if (response === null) return createUnknownToolError(prepared.toolName)
  if (response.isError === true) return response
  const completed = await auditExecution(prepared, input.currentTimeMillis, "registered_tool_executed")
  if (!completed) {
    return createInvalidParamsError(
      "Mutation succeeded, but its completion audit record could not be written.",
      "AuditCompletionUnavailable"
    )
  }
  return successfulResponse(prepared.toolName, response)
}

export const prepareRegisteredToolAction = async (input: ApprovalInput): Promise<McpToolResponse> => {
  if (input.clients === undefined || input.currentTimeMillis === undefined) {
    return createInvalidParamsError("prepare_tool_action requires initialized Huly clients.", "ProxyClientsMissing")
  }
  const decoded = Schema.decodeUnknownResult(PrepareToolActionParamsSchema)(input.args ?? {})
  if (Result.isFailure(decoded)) return mapParseErrorToMcp(decoded.failure, input.toolName)
  const target = await validateApprovalTarget(input.registry, decoded.success.toolName, decoded.success.arguments)
  if (target._tag === "Failure") return target.response
  const approvalId = `approval_${randomUUID()}`
  const hash = argumentsHash(target.args)
  const expiresAt = input.currentTimeMillis + TOOL_APPROVAL_TTL_MS
  const accountUuid = String(input.clients.hulyClient.getAccountUuid())
  const audited = await appendApprovalAudit({
    event: "registered_tool_prepared",
    timestamp: input.currentTimeMillis,
    accountUuid,
    toolName: decoded.success.toolName,
    argumentsHash: hash,
    expiresAt
  })
  if (!audited) {
    return createInvalidParamsError("Mutation audit log is unavailable; approval was not created.", "AuditUnavailable")
  }
  preparedToolActions.set(approvalId, {
    accountUuid,
    args: target.args,
    argumentsHash: hash,
    expiresAt,
    toolName: decoded.success.toolName
  })
  return createSuccessResponse({
    approvalId: ToolName.make(approvalId),
    expiresAt,
    toolName: decoded.success.toolName,
    arguments: target.args,
    argumentsHash: hash,
    warning: ToolDescription.make(
      "Review the target and exact arguments. The next step executes a potentially irreversible action."
    )
  })
}

export const executeRegisteredToolAction = async (input: ApprovalInput): Promise<McpToolResponse> => {
  if (input.clients === undefined || input.currentTimeMillis === undefined) {
    return createInvalidParamsError(
      "execute_approved_tool_action requires initialized Huly clients.",
      "ProxyClientsMissing"
    )
  }
  const decoded = Schema.decodeUnknownResult(ExecuteToolActionParamsSchema)(input.args ?? {})
  if (Result.isFailure(decoded)) return mapParseErrorToMcp(decoded.failure, input.toolName)
  const initialized = { ...input, clients: input.clients, currentTimeMillis: input.currentTimeMillis }
  const consumed = consumeApproval(initialized, decoded.success.approvalId)
  if (consumed._tag === "Failure") return consumed.response
  if (!matchesPreparedAction(consumed.prepared, decoded.success.toolName, decoded.success.arguments)) {
    return createInvalidParamsError(
      "The tool name or arguments do not match the prepared action. Prepare the exact action again.",
      "ApprovalMismatch"
    )
  }
  return executePreparedAction(initialized, consumed.prepared)
}

export const destructiveProxyAnnotations: ToolAnnotations = {
  title: "Execute Approved Tool Action",
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false
}
