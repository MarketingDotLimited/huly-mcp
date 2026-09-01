import type { ToolAnnotations } from "@modelcontextprotocol/server"
import { Result, Schema, type SchemaAST } from "effect"

import { Count } from "../domain/schemas/index.js"
import {
  createImageSuccessResponse,
  createInvalidParamsError,
  createSuccessResponse,
  createUnknownToolError,
  mapParseErrorToMcp,
  type McpToolResponse
} from "./error-mapping.js"
import {
  listCategories,
  SEARCH_DEFAULT_LIMIT_VALUE,
  SEARCH_MAX_LIMIT,
  searchToolDefinitions,
  SearchToolLimit,
  ToolParameterName,
  toolParamSummary,
  ToolSearchQuery
} from "./proxy-tool-catalog.js"
import { createToolOutputSchema } from "./tool-output-schema.js"
import {
  destructiveProxyAnnotations,
  ExecutedToolActionResultSchema,
  executeRegisteredToolAction,
  executeToolActionInputSchema,
  prepareRegisteredToolAction,
  PrepareToolActionResultSchema,
  prepareToolActionInputSchema,
  requiresTwoStepApproval,
  type ToolApprovalClients
} from "./proxy-tool-approvals.js"
import type { ToolRegistry } from "./tools/index.js"
import { resolveAnnotations } from "./tools/index.js"
import {
  createToolDefinition,
  makeToolCategory,
  ToolCategory,
  type ToolDefinition,
  ToolDescription,
  ToolName
} from "./tools/registry.js"

export { makeSearchToolLimit, makeToolSearchQuery, searchToolDefinitions } from "./proxy-tool-catalog.js"

const LIST_TOOL_CATEGORIES_TOOL_NAME = ToolName.make("list_tool_categories")
const SEARCH_TOOLS_TOOL_NAME = ToolName.make("search_tools")
const GET_TOOL_SCHEMA_TOOL_NAME = ToolName.make("get_tool_schema")
export const INVOKE_TOOL_TOOL_NAME = ToolName.make("invoke_tool")
export const INVOKE_READ_TOOL_TOOL_NAME = ToolName.make("invoke_read_tool")
export const INVOKE_WRITE_TOOL_TOOL_NAME = ToolName.make("invoke_write_tool")
export const PREPARE_TOOL_ACTION_TOOL_NAME = ToolName.make("prepare_tool_action")
export const EXECUTE_APPROVED_TOOL_ACTION_TOOL_NAME = ToolName.make("execute_approved_tool_action")
const PROXY_TOOL_CATEGORY = makeToolCategory("proxy")

const EmptyProxyParamsSchema = Schema.Record(Schema.String, Schema.Never)
const SearchToolsParamsSchema = Schema.Struct({ query: ToolSearchQuery, limit: Schema.optionalKey(SearchToolLimit) })
const ToolNameParamsSchema = Schema.Struct({ toolName: ToolName })
export const InvokeToolParamsSchema = Schema.Struct({
  toolName: ToolName,
  arguments: Schema.optionalKey(Schema.Unknown)
})

const ToolAnnotationsSchema = Schema.Struct({
  title: Schema.optionalKey(Schema.Trimmed.pipe(Schema.check(Schema.isNonEmpty()))),
  readOnlyHint: Schema.optionalKey(Schema.Boolean),
  destructiveHint: Schema.optionalKey(Schema.Boolean),
  idempotentHint: Schema.optionalKey(Schema.Boolean),
  openWorldHint: Schema.optionalKey(Schema.Boolean)
})
const ProxyCatalogToolSchema = Schema.Struct({
  name: ToolName,
  description: ToolDescription,
  annotations: ToolAnnotationsSchema,
  requiresApproval: Schema.Boolean
})
const ProxyToolCategorySchema = Schema.Struct({
  name: ToolCategory,
  description: ToolDescription,
  toolCount: Count,
  tools: Schema.Array(ProxyCatalogToolSchema)
})
const ListToolCategoriesResultSchema = Schema.Struct({
  totalToolCount: Count,
  categories: Schema.Array(ProxyToolCategorySchema)
})
const ToolSearchMatchBaseSchema = Schema.Struct({
  name: ToolName,
  category: ToolCategory,
  description: ToolDescription,
  requiredParams: Schema.Array(ToolParameterName),
  optionalParams: Schema.Array(ToolParameterName)
})
const ToolSearchMatchSchema = Schema.Union([
  ToolSearchMatchBaseSchema.pipe(Schema.fieldsAssign({ parameterSummaryStatus: Schema.Literal("available") })),
  ToolSearchMatchBaseSchema.pipe(Schema.fieldsAssign({ parameterSummaryStatus: Schema.Literal("empty") })),
  ToolSearchMatchBaseSchema.pipe(
    Schema.fieldsAssign({
      parameterSummaryStatus: Schema.Literal("invalid_input_schema"),
      parameterSummaryIssue: Schema.String
    })
  )
])
const SearchToolsResultSchema = Schema.Struct({ matches: Schema.Array(ToolSearchMatchSchema) })
const GetToolSchemaResultSchema = Schema.Struct({
  name: ToolName,
  category: ToolCategory,
  description: ToolDescription,
  inputSchema: Schema.Unknown,
  outputSchema: Schema.Unknown,
  annotations: ToolAnnotationsSchema
})
const InvokeToolResultSchema = Schema.Struct({
  toolName: ToolName,
  result: Schema.Unknown,
  warnings: Schema.optionalKey(Schema.Array(Schema.Unknown))
})

const emptyInputSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {},
  additionalProperties: false
} satisfies ToolDefinition["inputSchema"]

const searchToolsInputSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    query: {
      type: "string",
      minLength: 1,
      description: "Search text matched against Huly tool names, categories, descriptions, and parameter names."
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: SEARCH_MAX_LIMIT,
      description: "Maximum number of matches to return. Defaults to 10 and cannot exceed 50."
    }
  },
  required: ["query"],
  additionalProperties: false
} satisfies ToolDefinition["inputSchema"]

const toolNameInputSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    toolName: {
      type: "string",
      minLength: 1,
      description: "Exact Huly tool name from search_tools or list_tool_categories results."
    }
  },
  required: ["toolName"],
  additionalProperties: false
} satisfies ToolDefinition["inputSchema"]

const invokeToolInputSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    toolName: { type: "string", minLength: 1, description: "Exact Huly tool name to invoke through the proxy." },
    arguments: {
      description: "Arguments object for the target Huly tool. Use {} when the target tool accepts no parameters."
    }
  },
  required: ["toolName"],
  additionalProperties: false
} satisfies ToolDefinition["inputSchema"]

const readOnlyProxyAnnotations = (title: string): ToolAnnotations => ({
  title,
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
})

export const proxyToolDefinitions: ReadonlyArray<ToolDefinition> = [
  createToolDefinition({
    name: LIST_TOOL_CATEGORIES_TOOL_NAME,
    description:
      "Lists every proxy-visible Huly tool grouped by category, including exact names, descriptions, resolved safety annotations, and approval requirements. The result is a complete deterministic catalog, not a paginated search sample.",
    inputSchema: emptyInputSchema,
    outputSchema: createToolOutputSchema(ListToolCategoriesResultSchema),
    category: PROXY_TOOL_CATEGORY,
    annotations: readOnlyProxyAnnotations("List Tool Categories")
  }),
  createToolDefinition({
    name: SEARCH_TOOLS_TOOL_NAME,
    description:
      "Searches the current proxy-visible Huly tool catalog by tool name, category, description, and parameter names. Returns exact tool names plus required and optional parameter names for single-call follow-up with get_tool_schema or invoke_tool.",
    inputSchema: searchToolsInputSchema,
    outputSchema: createToolOutputSchema(SearchToolsResultSchema),
    category: PROXY_TOOL_CATEGORY,
    annotations: readOnlyProxyAnnotations("Search Tools")
  }),
  createToolDefinition({
    name: GET_TOOL_SCHEMA_TOOL_NAME,
    description:
      "Returns the exact input and output schema for one proxy-visible Huly tool. Use this before invoke_tool when you are not certain about required argument names or result shape.",
    inputSchema: toolNameInputSchema,
    outputSchema: createToolOutputSchema(GetToolSchemaResultSchema),
    category: PROXY_TOOL_CATEGORY,
    annotations: readOnlyProxyAnnotations("Get Tool Schema")
  }),
  createToolDefinition({
    name: INVOKE_READ_TOOL_TOOL_NAME,
    description:
      "Invokes one read-only Huly tool by exact name with its arguments. The server rejects any target whose resolved annotations are not read-only, so this executor cannot perform Huly writes.",
    inputSchema: invokeToolInputSchema,
    outputSchema: createToolOutputSchema(ExecutedToolActionResultSchema),
    category: PROXY_TOOL_CATEGORY,
    annotations: readOnlyProxyAnnotations("Invoke Read Tool")
  }),
  createToolDefinition({
    name: INVOKE_WRITE_TOOL_TOOL_NAME,
    description:
      "Invokes one write-capable Huly tool by exact name with its arguments. Read-only targets are rejected. Destructive or high-impact targets still require prepare_tool_action and execute_approved_tool_action.",
    inputSchema: invokeToolInputSchema,
    outputSchema: createToolOutputSchema(ExecutedToolActionResultSchema),
    category: PROXY_TOOL_CATEGORY,
    annotations: {
      title: "Invoke Write Tool",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    }
  }),
  createToolDefinition({
    name: INVOKE_TOOL_TOOL_NAME,
    description:
      "Legacy compatibility executor for read or write Huly operations. Prefer invoke_read_tool for enforced reads and invoke_write_tool for writes.",
    inputSchema: invokeToolInputSchema,
    outputSchema: createToolOutputSchema(ExecutedToolActionResultSchema),
    category: PROXY_TOOL_CATEGORY,
    annotations: {
      title: "Invoke Tool",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false
    }
  }),
  createToolDefinition({
    name: PREPARE_TOOL_ACTION_TOOL_NAME,
    description:
      "Validates and binds the exact arguments for a destructive or high-impact Huly tool. Supported entity deletions also run a live read-only impact preview and reject missing targets before approval. Performs no mutation and returns a five-minute single-use approval ID together with the inspectable tool name and arguments required by execute_approved_tool_action.",
    inputSchema: prepareToolActionInputSchema,
    outputSchema: createToolOutputSchema(PrepareToolActionResultSchema),
    category: PROXY_TOOL_CATEGORY,
    annotations: readOnlyProxyAnnotations("Prepare Tool Action")
  }),
  createToolDefinition({
    name: EXECUTE_APPROVED_TOOL_ACTION_TOOL_NAME,
    description:
      "Use this only after prepare_tool_action. Executes exactly one destructive or high-impact Huly action using the returned approvalId, toolName, and unchanged arguments so the action and target remain inspectable before confirmation. Approval IDs expire after five minutes and cannot be replayed.",
    inputSchema: executeToolActionInputSchema,
    outputSchema: createToolOutputSchema(InvokeToolResultSchema),
    category: PROXY_TOOL_CATEGORY,
    annotations: destructiveProxyAnnotations
  })
]

export const PROXY_TOOL_NAMES: ReadonlyArray<ToolName> = proxyToolDefinitions.map((tool) => ToolName.make(tool.name))

export const isProxyToolName = (name: string): name is ToolName =>
  PROXY_TOOL_NAMES.some((toolName) => toolName === name)

const isInvocationProxyToolName = (name: ToolName): boolean =>
  [INVOKE_READ_TOOL_TOOL_NAME, INVOKE_WRITE_TOOL_TOOL_NAME, INVOKE_TOOL_TOOL_NAME].some((toolName) => toolName === name)

type DecodeOrErrorResult<A> =
  | { readonly _tag: "success"; readonly params: A }
  | { readonly _tag: "error"; readonly response: McpToolResponse }

const strictProxyInputParseOptions = { onExcessProperty: "error" } as const satisfies SchemaAST.ParseOptions

const decodeOrError = <A, I>(
  schema: Schema.Codec<A, I>,
  input: unknown,
  toolName: ToolName
): DecodeOrErrorResult<A> => {
  const decoded = Schema.decodeUnknownResult(schema, strictProxyInputParseOptions)(input ?? {})
  if (Result.isSuccess(decoded)) return { _tag: "success", params: decoded.success }
  return { _tag: "error", response: mapParseErrorToMcp(decoded.failure, toolName) }
}

const searchTools = (registry: ToolRegistry, args: unknown): McpToolResponse => {
  const decoded = decodeOrError(SearchToolsParamsSchema, args, SEARCH_TOOLS_TOOL_NAME)
  if (decoded._tag === "error") return decoded.response
  const params = decoded.params
  const limit = params.limit ?? SEARCH_DEFAULT_LIMIT_VALUE
  const matches = searchToolDefinitions(registry, params.query, limit).map((tool) => {
    const paramSummary = toolParamSummary(tool)
    return {
      name: tool.name,
      category: tool.category,
      description: tool.description,
      requiredParams: paramSummary.requiredParams,
      optionalParams: paramSummary.optionalParams,
      parameterSummaryStatus: paramSummary.parameterSummaryStatus,
      ...(paramSummary.parameterSummaryIssue === undefined
        ? {}
        : { parameterSummaryIssue: paramSummary.parameterSummaryIssue })
    }
  })
  return createSuccessResponse({ matches })
}

const getToolSchema = (registry: ToolRegistry, args: unknown): McpToolResponse => {
  const decoded = decodeOrError(ToolNameParamsSchema, args, GET_TOOL_SCHEMA_TOOL_NAME)
  if (decoded._tag === "error") return decoded.response
  const params = decoded.params

  const tool = registry.tools.get(params.toolName)
  if (tool === undefined) return createUnknownToolError(params.toolName)
  return createSuccessResponse({
    name: tool.name,
    category: tool.category,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    annotations: resolveAnnotations(tool)
  })
}

type InvokeToolClients = ToolApprovalClients

const DeferredToolArgumentsJsonSchema = Schema.fromJsonString(Schema.Unknown)

/**
 * Some deferred-tool clients serialize invoke_tool's schema-less arguments value.
 * Decode that transport shape once here, immediately before target dispatch. Invalid
 * JSON remains unchanged so the target schema reports the actual value it received.
 */
const normalizeDeferredToolArguments = (value: unknown): unknown => {
  if (typeof value !== "string") return value
  const decoded = Schema.decodeUnknownResult(DeferredToolArgumentsJsonSchema)(value)
  return Result.isSuccess(decoded) ? decoded.success : value
}

type SuccessfulToolCallResponse = Exclude<McpToolResponse, { readonly isError: true }>

const successfulInvokeResponse = (toolName: ToolName, response: SuccessfulToolCallResponse): McpToolResponse => {
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

const invocationPolicyError = (target: ToolDefinition, proxyToolName: ToolName): McpToolResponse | undefined => {
  const annotations = resolveAnnotations(target)
  if (proxyToolName === INVOKE_READ_TOOL_TOOL_NAME && annotations.readOnlyHint !== true) {
    return createInvalidParamsError(
      `Tool '${target.name}' is not read-only and cannot be called with invoke_read_tool. Use invoke_write_tool, or the approval flow when required.`,
      "ReadOnlyToolRequired"
    )
  }
  if (proxyToolName === INVOKE_WRITE_TOOL_TOOL_NAME && annotations.readOnlyHint === true) {
    return createInvalidParamsError(
      `Tool '${target.name}' is read-only. Call it with invoke_read_tool so the MCP client can apply the correct safety policy.`,
      "WriteToolRequired"
    )
  }
  return undefined
}

const invokeTool = async (
  registry: ToolRegistry,
  args: unknown,
  clients: InvokeToolClients,
  proxyToolName: ToolName
): Promise<McpToolResponse> => {
  const decoded = decodeOrError(InvokeToolParamsSchema, args, proxyToolName)
  if (decoded._tag === "error") return decoded.response
  const params = decoded.params

  const target = registry.tools.get(params.toolName)
  if (target === undefined) return createUnknownToolError(params.toolName)
  const policyError = invocationPolicyError(target, proxyToolName)
  if (policyError !== undefined) return policyError
  if (requiresTwoStepApproval(target)) {
    return createInvalidParamsError(
      `Tool '${params.toolName}' requires two-step approval. Call prepare_tool_action with this exact toolName and arguments, then pass its approvalId, toolName, and arguments to execute_approved_tool_action.`,
      "ApprovalRequired"
    )
  }

  const response = await registry.handleToolCall(
    params.toolName,
    normalizeDeferredToolArguments(params.arguments),
    clients.hulyClient,
    clients.storageClient,
    clients.workspaceClient
  )
  if (response === null) return createUnknownToolError(params.toolName)
  if (response.isError === true) return response
  return successfulInvokeResponse(params.toolName, response)
}

interface ProxyToolCallInput {
  readonly toolName: ToolName
  readonly args: unknown
  readonly proxyCandidateRegistry: ToolRegistry
  readonly clients?: InvokeToolClients
  readonly currentTimeMillis?: number
}

const listProxyCategories = (registry: ToolRegistry, args: unknown): McpToolResponse => {
  const decoded = decodeOrError(EmptyProxyParamsSchema, args, LIST_TOOL_CATEGORIES_TOOL_NAME)
  return decoded._tag === "error" ? decoded.response : listCategories(registry, requiresTwoStepApproval)
}

const invokeProxyTool = (input: ProxyToolCallInput): Promise<McpToolResponse> => {
  if (input.clients === undefined) {
    return Promise.resolve(
      createInvalidParamsError(`${input.toolName} requires initialized Huly clients.`, "ProxyClientsMissing")
    )
  }
  return invokeTool(input.proxyCandidateRegistry, input.args, input.clients, input.toolName)
}

const approvalInput = (input: ProxyToolCallInput, toolName: ToolName) => ({
  toolName,
  args: input.args,
  registry: input.proxyCandidateRegistry,
  ...(input.clients === undefined ? {} : { clients: input.clients }),
  ...(input.currentTimeMillis === undefined ? {} : { currentTimeMillis: input.currentTimeMillis })
})

export const handleProxyToolCall = async (input: ProxyToolCallInput): Promise<McpToolResponse> => {
  if (isInvocationProxyToolName(input.toolName)) return invokeProxyTool(input)
  switch (input.toolName) {
    case LIST_TOOL_CATEGORIES_TOOL_NAME:
      return listProxyCategories(input.proxyCandidateRegistry, input.args)
    case SEARCH_TOOLS_TOOL_NAME:
      return searchTools(input.proxyCandidateRegistry, input.args)
    case GET_TOOL_SCHEMA_TOOL_NAME:
      return getToolSchema(input.proxyCandidateRegistry, input.args)
    case PREPARE_TOOL_ACTION_TOOL_NAME:
      return prepareRegisteredToolAction(approvalInput(input, PREPARE_TOOL_ACTION_TOOL_NAME))
    case EXECUTE_APPROVED_TOOL_ACTION_TOOL_NAME:
      return executeRegisteredToolAction(approvalInput(input, EXECUTE_APPROVED_TOOL_ACTION_TOOL_NAME))
    default:
      return createUnknownToolError(input.toolName)
  }
}
