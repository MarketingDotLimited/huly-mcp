import { Result, Schema } from "effect"

const nodeVersionPattern = /^\d{1,9}\.\d{1,9}\.\d{1,9}$/u
const nodeRequirementPattern = /^>=\d{1,9}\.\d{1,9}\.\d{1,9}$/u
const NodeVersionTextSchema = Schema.String.check(Schema.isPattern(nodeVersionPattern)).pipe(
  Schema.brand("NodeVersionText")
)
const NodeRequirementTextSchema = Schema.String.check(Schema.isPattern(nodeRequirementPattern)).pipe(
  Schema.brand("NodeRequirementText")
)
const SemanticVersionSchema = Schema.Struct({ major: Schema.Number, minor: Schema.Number, patch: Schema.Number })

type NodeVersionText = Schema.Schema.Type<typeof NodeVersionTextSchema>
type SemanticVersion = Schema.Schema.Type<typeof SemanticVersionSchema>

const UnsupportedNodeMcpConfigSchema = Schema.Struct({
  detectedNodeVersion: NodeVersionTextSchema,
  executable: Schema.NonEmptyString,
  requiredNodeVersion: NodeRequirementTextSchema,
  serverVersion: Schema.NonEmptyString
})

export type UnsupportedNodeMcpConfig = Schema.Schema.Type<typeof UnsupportedNodeMcpConfigSchema>

const parseErrorCode = -32700
const invalidRequestCode = -32600
const methodNotFoundCode = -32601
const invalidParamsCode = -32602
const diagnosticToolName = "get_huly_startup_diagnostic"

const JsonRpcIdSchema = Schema.Union([Schema.String, Schema.Number])
const JsonRpcErrorCodeSchema = Schema.Literals([
  parseErrorCode,
  invalidParamsCode,
  methodNotFoundCode,
  invalidRequestCode
])
const JsonRpcRequestSchema = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.optionalKey(JsonRpcIdSchema),
  method: Schema.String,
  params: Schema.optionalKey(Schema.Unknown)
})
const InitializeParamsSchema = Schema.Struct({ protocolVersion: Schema.NonEmptyString })
const ToolCallParamsSchema = Schema.Struct({ name: Schema.String })
const JsonRpcSuccessSchema = Schema.Struct({ jsonrpc: Schema.Literal("2.0"), id: JsonRpcIdSchema, result: Schema.Json })
const JsonRpcErrorSchema = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Union([JsonRpcIdSchema, Schema.Null]),
  error: Schema.Struct({ code: JsonRpcErrorCodeSchema, message: Schema.String })
})
const JsonRpcResponseSchema = Schema.Union([JsonRpcSuccessSchema, JsonRpcErrorSchema])

type JsonRpcId = Schema.Schema.Type<typeof JsonRpcIdSchema>
type JsonRpcErrorCode = Schema.Schema.Type<typeof JsonRpcErrorCodeSchema>
type JsonRpcRequest = Schema.Schema.Type<typeof JsonRpcRequestSchema>
type JsonRpcResponse = Schema.Schema.Type<typeof JsonRpcResponseSchema>
type JsonRpcResult = Schema.Schema.Type<typeof Schema.Json>

const parseRequest = Schema.decodeUnknownResult(Schema.fromJsonString(JsonRpcRequestSchema))
const parseInitializeParams = Schema.decodeUnknownResult(InitializeParamsSchema)
const parseToolCallParams = Schema.decodeUnknownResult(ToolCallParamsSchema)
const encodeResponse = Schema.encodeSync(Schema.fromJsonString(JsonRpcResponseSchema))

export const parseUnsupportedNodeMcpConfig = Schema.decodeUnknownSync(UnsupportedNodeMcpConfigSchema)

export const renderUnsupportedNodeDiagnostic = (config: UnsupportedNodeMcpConfig): string => {
  const minimumVersion = config.requiredNodeVersion.replace(/^>=/u, "")
  return (
    `Huly MCP startup failed: unsupported Node.js runtime. Detected ${config.detectedNodeVersion} at ${config.executable}; ` +
    `required ${config.requiredNodeVersion}. MCP hosts use the Node.js executable resolved by their configured ` +
    `command and PATH. Install Node.js ${minimumVersion} or later, or configure this MCP server's command ` +
    `to a compatible Node.js executable, then restart the MCP server.`
  )
}

const parseNodeVersionText = Schema.decodeUnknownResult(NodeVersionTextSchema)
const parseNodeRequirementText = Schema.decodeUnknownResult(NodeRequirementTextSchema)
const parseMinimumNodeVersionText = Schema.decodeUnknownSync(NodeVersionTextSchema)

const parseSemanticVersion = (value: NodeVersionText): SemanticVersion => {
  const [major, minor, patch] = value.split(".")
  return Schema.decodeUnknownSync(SemanticVersionSchema)({
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch)
  })
}

export const isUnsupportedNodeRuntime = (actual: string, requirement: string): boolean => {
  const actualText = parseNodeVersionText(actual)
  const requirementText = parseNodeRequirementText(requirement)
  if (Result.isFailure(actualText) || Result.isFailure(requirementText)) return true
  const minimumText = parseMinimumNodeVersionText(requirementText.success.slice(">=".length))
  const actualVersion = parseSemanticVersion(actualText.success)
  const minimumVersion = parseSemanticVersion(minimumText)
  if (actualVersion.major !== minimumVersion.major) return actualVersion.major < minimumVersion.major
  if (actualVersion.minor !== minimumVersion.minor) return actualVersion.minor < minimumVersion.minor
  return actualVersion.patch < minimumVersion.patch
}

const success = (id: JsonRpcId, result: JsonRpcResult): JsonRpcResponse => ({ id, jsonrpc: "2.0", result })

const successWhenRequested = (id: JsonRpcId | undefined, result: JsonRpcResult): JsonRpcResponse | undefined =>
  id === undefined ? undefined : success(id, result)

const error = (id: JsonRpcId | null, code: JsonRpcErrorCode, message: string): JsonRpcResponse => ({
  error: { code, message },
  id,
  jsonrpc: "2.0"
})

const diagnosticTool = (diagnostic: string): JsonRpcResult => ({
  name: diagnosticToolName,
  description: diagnostic,
  inputSchema: { additionalProperties: false, properties: {}, type: "object" },
  annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false, readOnlyHint: true }
})

const diagnosticToolResult = (config: UnsupportedNodeMcpConfig, diagnostic: string): JsonRpcResult => ({
  content: [{ text: diagnostic, type: "text" }],
  isError: true,
  structuredContent: {
    error: {
      code: "UNSUPPORTED_NODE_RUNTIME",
      detectedNodeVersion: config.detectedNodeVersion,
      executable: config.executable,
      requiredNodeVersion: config.requiredNodeVersion
    }
  }
})

const initializeResponse = (
  request: JsonRpcRequest,
  config: UnsupportedNodeMcpConfig,
  diagnostic: string
): JsonRpcResponse => {
  const params = parseInitializeParams(request.params)
  const requestId = request.id
  if (requestId === undefined || Result.isFailure(params))
    return error(requestId ?? null, invalidRequestCode, diagnostic)
  return success(requestId, {
    capabilities: { tools: { listChanged: false } },
    instructions: diagnostic,
    protocolVersion: params.success.protocolVersion,
    serverInfo: { name: "huly-mcp", version: config.serverVersion }
  })
}

const toolCallResponse = (
  request: JsonRpcRequest,
  config: UnsupportedNodeMcpConfig,
  diagnostic: string
): JsonRpcResponse => {
  const params = parseToolCallParams(request.params)
  const requestId = request.id
  if (requestId === undefined || Result.isFailure(params))
    return error(requestId ?? null, invalidRequestCode, diagnostic)
  return params.success.name === diagnosticToolName
    ? success(requestId, diagnosticToolResult(config, diagnostic))
    : error(requestId, invalidParamsCode, diagnostic)
}

const responseForRequest = (
  request: JsonRpcRequest,
  config: UnsupportedNodeMcpConfig,
  diagnostic: string
): JsonRpcResponse | undefined => {
  switch (request.method) {
    case "initialize":
      return initializeResponse(request, config, diagnostic)
    case "notifications/initialized":
      return undefined
    case "ping":
      return successWhenRequested(request.id, {})
    case "tools/list":
      return successWhenRequested(request.id, { tools: [diagnosticTool(diagnostic)] })
    case "tools/call":
      return toolCallResponse(request, config, diagnostic)
    default:
      return request.id === undefined ? undefined : error(request.id, methodNotFoundCode, diagnostic)
  }
}

export const handleUnsupportedNodeRequest = (line: string, config: UnsupportedNodeMcpConfig): string | undefined => {
  const diagnostic = renderUnsupportedNodeDiagnostic(config)
  const decoded = parseRequest(line)
  const response = Result.isFailure(decoded)
    ? error(null, parseErrorCode, diagnostic)
    : responseForRequest(decoded.success, config, diagnostic)
  return response === undefined ? undefined : encodeResponse(response)
}
