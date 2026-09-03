import type { Server, ServerContext } from "@modelcontextprotocol/server"
import type { GetHulyContextResult } from "../domain/schemas/index.js"
import type { HostedHulyMigrationInstructions } from "../huly/unavailable-diagnostics.js"
import type { ClientResolver } from "../runtime/client-resolver.js"
import type { TelemetryOperations } from "../telemetry/telemetry.js"
import type { ToolExposureContext } from "./huly-context-tool.js"
import { createMcpProtocolHandlers } from "./protocol-handlers.js"
import { type ProtocolExposureOptions, type ProtocolToolRegistries } from "./protocol-tool-exposure.js"
import { createDefaultMcpSdkServer } from "./sdk-server.js"
import { noToolCallNoticeProvider, type ToolCallNoticeProvider } from "./tool-call-notices.js"
import { Option } from "effect"
import { resolveProtocolExposure } from "./protocol-tool-exposure.js"
import { parseMcpClientInfo, resolveRequestMcpClientInfo } from "./tool-mode.js"
import type { ToolRegistry } from "./tools/index.js"

export type { ClientBundle } from "../runtime/client-resolver.js"

export interface McpServerLifecycle {
  readonly quiesce: () => Promise<void>
}

type McpServerHandle = readonly [server: Server, lifecycle: McpServerLifecycle]

interface McpServerExposureOptions extends Partial<ProtocolExposureOptions> {
  readonly fallbackToCurrentClientInfoWhenRequestMetadataMissing?: boolean
  readonly currentRequestId?: () => string
}

export interface McpProtocolDiagnostics {
  readonly listToolsCompleted: (input: {
    readonly clientInfo: ReturnType<typeof parseMcpClientInfo>
    readonly exposure: ReturnType<typeof resolveProtocolExposure>["context"]
    readonly returnedToolNames: ReadonlyArray<string>
  }) => void
  readonly toolCallCompleted: (input: {
    readonly clientInfo: ReturnType<typeof parseMcpClientInfo>
    readonly toolName: string
    readonly isError: boolean
  }) => void
}

const currentClientInfoFromServer = (
  server: Server
): ReturnType<NonNullable<ProtocolExposureOptions["currentClientInfo"]>> => {
  const maybeServer: { readonly getClientVersion?: () => ReturnType<Server["getClientVersion"]> } = server
  return parseMcpClientInfo(maybeServer.getClientVersion?.())
}

export const createMcpServer = (
  resolveClients: ClientResolver,
  telemetry: TelemetryOperations,
  registry: ToolRegistry | ProtocolToolRegistries,
  getHulyContext: (toolExposure: ToolExposureContext) => GetHulyContextResult,
  createServer: (instructions?: HostedHulyMigrationInstructions) => Server = createDefaultMcpSdkServer,
  exposureOptions: McpServerExposureOptions = {},
  toolCallNoticeProvider: ToolCallNoticeProvider = noToolCallNoticeProvider,
  serverInstructions?: HostedHulyMigrationInstructions,
  diagnostics?: McpProtocolDiagnostics
): McpServerHandle => {
  const server = createServer(serverInstructions)
  const currentClientInfo = (): ReturnType<NonNullable<ProtocolExposureOptions["currentClientInfo"]>> =>
    exposureOptions.currentClientInfo?.() ?? currentClientInfoFromServer(server)
  const requestClientInfo = (context: ServerContext | undefined) =>
    resolveRequestMcpClientInfo(
      context?.mcpReq.envelope,
      currentClientInfo,
      exposureOptions.fallbackToCurrentClientInfoWhenRequestMetadataMissing ?? false
    )
  const handlers = createMcpProtocolHandlers(
    resolveClients,
    telemetry,
    registry,
    getHulyContext,
    undefined,
    undefined,
    { ...exposureOptions, currentClientInfo },
    toolCallNoticeProvider
  )

  server.setRequestHandler("tools/list", async (_request, context) => {
    const clientInfo = requestClientInfo(context)
    const result = await handlers.listTools(clientInfo)
    diagnostics?.listToolsCompleted({
      clientInfo: Option.getOrUndefined(clientInfo),
      exposure: resolveProtocolExposure(
        "fullRegistry" in registry ? registry : { fullRegistry: registry, scopedNativeRegistry: registry },
        {
          exposureConfig: exposureOptions.exposureConfig ?? { configuredMode: "native", proxyOutputStrict: false },
          toolScopeFilteringActive: exposureOptions.toolScopeFilteringActive ?? false,
          currentClientInfo: () => Option.getOrUndefined(clientInfo)
        }
      ).context,
      returnedToolNames: result.tools.map((tool) => tool.name)
    })
    return result
  })
  server.setRequestHandler("tools/call", async (request, context) => {
    const clientInfo = requestClientInfo(context)
    const result = await handlers.callTool(request, clientInfo)
    diagnostics?.toolCallCompleted({
      clientInfo: Option.getOrUndefined(clientInfo),
      toolName: request.params.name,
      isError: result.isError === true
    })
    return result
  })
  server.setRequestHandler("resources/list", handlers.listResources)
  server.setRequestHandler("resources/templates/list", handlers.listResourceTemplates)
  server.setRequestHandler("resources/read", handlers.readResource)

  return [server, { quiesce: handlers.quiesce }]
}
