/**
 * Effect AI registration for the Huly MCP tool and resource registries.
 *
 * The Huly registry intentionally stays independent from the MCP transport.
 * A transport provides `McpServer` (through `McpServer.layerStdio`,
 * `McpServer.layerHttp`, or `McpServer.layer`) and provides this module's
 * registration effect.  This keeps request-scoped client acquisition in the
 * caller's closure while making protocol dispatch Effect-native.
 */
import { Clock, Context, Effect, Layer } from "effect"
import { McpServer } from "effect/unstable/ai/McpServer"
import * as McpSchema from "effect/unstable/ai/McpSchema"

import type { GetHulyContextResult } from "../domain/schemas/index.js"
import { HulyError } from "../huly/errors-base.js"
import type { ClientResolver } from "../runtime/client-resolver.js"
import type { TelemetryOperations } from "../telemetry/telemetry.js"
import type { McpToolResponse } from "./error-mapping.js"
import {
  appendToolWarnings,
  createServerShuttingDownError,
  mapDomainErrorToMcp
} from "./error-mapping.js"
import {
  getHulyContextToolDefinition,
  type ToolExposureContext,
  versionToolDefinition
} from "./huly-context-tool.js"
import { createRequestAdmission, type RequestAdmission } from "./request-admission.js"
import { requestScopedResolver } from "./effect-ai-request.js"
import {
  defaultExposureOptions,
  normalizeRegistries,
  type ProtocolExposureOptions,
  type ProtocolToolRegistries,
  resolveProtocolExposure
} from "./protocol-tool-exposure.js"
import { proxyToolDefinitions } from "./proxy-tools.js"
import type { ToolCallNoticeProvider } from "./tool-call-notices.js"
import { noToolCallNoticeProvider } from "./tool-call-notices.js"
import type { ToolRegistry } from "./tools/index.js"
import { makeToolCategory, resolveAnnotations } from "./tools/registry.js"
import type { ToolDefinition } from "./tools/registry.js"
import type { McpClientInfoLike } from "./tool-mode.js"
import { parseMcpClientInfo } from "./tool-mode.js"
import { registerEffectMcpResourceTemplates } from "./effect-ai-resources.js"
import { toEffectCallToolResult } from "./effect-ai-content.js"
import { dispatchEffectMcpTool, fetchLatestNpmVersion } from "./effect-ai-dispatch.js"

/** Inputs needed to build a transport-independent Effect MCP registry. */
export interface EffectMcpRegistryOptions {
  readonly resolveClients: ClientResolver
  readonly telemetry: TelemetryOperations
  readonly registry: ToolRegistry | ProtocolToolRegistries
  readonly getHulyContext: (toolExposure: ToolExposureContext) => GetHulyContextResult
  readonly exposureOptions?: Partial<ProtocolExposureOptions>
  readonly toolCallNoticeProvider?: ToolCallNoticeProvider
  readonly fetchLatestVersion?: () => Promise<string>
  readonly admission?: RequestAdmission
}

/**
 * The registration handle is deliberately small so a transport can own the
 * Effect scope while the server lifecycle owns request draining.
 */
export interface EffectMcpRegistry {
  readonly registration: Effect.Effect<void, never, McpServer>
  readonly layer: Layer.Layer<never, never, McpServer>
  readonly admission: RequestAdmission
  readonly quiesce: () => Promise<void>
}

type InitializePayload = typeof McpSchema.Initialize.payloadSchema.Type
type EffectCallToolResult = typeof McpSchema.CallToolResult.Type

const defaultToolAnnotations = (tool: ToolDefinition): McpSchema.ToolAnnotations => {
  const annotations = resolveAnnotations(tool)
  return {
    ...(annotations.title === undefined ? {} : { title: annotations.title }),
    readOnlyHint: annotations.readOnlyHint ?? false,
    destructiveHint: annotations.destructiveHint ?? true,
    idempotentHint: annotations.idempotentHint ?? false,
    openWorldHint: annotations.openWorldHint ?? true
  }
}

const clientInfoFromInitialize = (payload: InitializePayload): McpClientInfoLike | undefined =>
  parseMcpClientInfo({ name: payload.clientInfo.name })

export { toEffectCallToolResult }

const responseStatus = (response: McpToolResponse): "error" | "success" =>
  response.isError === true ? "error" : "success"

const responseOutputBytes = (response: McpToolResponse): number =>
  response.content.reduce((sum, entry) => sum + entry.text.length, 0)

const toolDefinition = (definition: ToolDefinition): McpSchema.Tool =>
  new McpSchema.Tool({
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    annotations: defaultToolAnnotations(definition)
  })

const builtinToolDefinitions = [versionToolDefinition, getHulyContextToolDefinition] as const

const asToolDefinition = (
  definition: (typeof builtinToolDefinitions)[number]
): ToolDefinition => ({
  name: definition.name,
  description: definition.description,
  inputSchema: definition.inputSchema,
  outputSchema: definition.outputSchema,
  category: makeToolCategory("builtin")
})

const contextForVisibility = (
  enabledWhen: (payload: InitializePayload) => boolean
): Context.Context<never> => Context.add(Context.empty(), McpSchema.EnabledWhen, enabledWhen)

const initializeExposure = (
  registries: ProtocolToolRegistries,
  options: ProtocolExposureOptions,
  payload: InitializePayload
) =>
  resolveProtocolExposure(registries, {
    ...options,
    currentClientInfo: () => clientInfoFromInitialize(payload)
  })

const makeToolHandler = (
  options: EffectMcpRegistryOptions,
  registries: ProtocolToolRegistries,
  exposureOptions: ProtocolExposureOptions,
  definition: ToolDefinition,
  admission: RequestAdmission,
  fetchLatestVersion: () => Promise<string>
): ((args: unknown) => Effect.Effect<EffectCallToolResult, McpSchema.InternalError | McpSchema.InvalidParams, McpSchema.McpServerClient>) => {
  const handler = (args: unknown): Effect.Effect<EffectCallToolResult, never, McpSchema.McpServerClient> =>
    Effect.acquireUseRelease(
      Effect.sync(() => admission.enter()),
      (lease) => {
        if (lease === null) return Effect.succeed(toEffectCallToolResult(createServerShuttingDownError()))
        return Effect.gen(function* () {
          const start = yield* Clock.currentTimeMillis
          const client = yield* McpSchema.McpServerClient
          const exposure = initializeExposure(registries, exposureOptions, client.initializePayload)
          const resolver = yield* requestScopedResolver(options.resolveClients)
          const call = dispatchEffectMcpTool(options, exposure, definition, args, fetchLatestVersion, resolver)
          const response = yield* Effect.acquireUseRelease(
            Effect.sync(() => (options.toolCallNoticeProvider ?? noToolCallNoticeProvider).claim()),
            (noticeClaim) =>
              call.pipe(
                Effect.map((value) => {
                  const withNotice =
                    noticeClaim._tag === "None" ? value : appendToolWarnings(value, [noticeClaim.warning])
                  if (noticeClaim._tag === "Claimed") noticeClaim.delivered()
                  return withNotice
                }),
                Effect.catchDefect((defect) =>
                  Effect.succeed(
                    mapDomainErrorToMcp(
                      new HulyError({ message: defect instanceof Error ? defect.message : "Tool execution failed" })
                    )
                  )
                )
              ),
            (noticeClaim) =>
              Effect.sync(() => {
                if (noticeClaim._tag === "Claimed") noticeClaim.release()
              })
          )
          const end = yield* Clock.currentTimeMillis
          yield* Effect.sync(() => {
            options.telemetry.toolCalled({
              toolName: definition.name,
              status: responseStatus(response),
              clientKind: exposure.context.clientKind,
              resolvedMode: exposure.context.resolvedMode,
              errorTag: response._meta?.errorTag,
              durationMs: end - start,
              inputBytes: JSON.stringify(args ?? {}).length,
              outputBytes: responseOutputBytes(response)
            })
          })
          return toEffectCallToolResult(response)
        })
      },
      (lease) => Effect.sync(() => lease?.release())
    )

  return handler
}

const registerTool = (
  server: McpServer["Service"],
  options: EffectMcpRegistryOptions,
  registries: ProtocolToolRegistries,
  exposureOptions: ProtocolExposureOptions,
  definition: ToolDefinition,
  visibility: (payload: InitializePayload) => boolean,
  admission: RequestAdmission,
  fetchLatestVersion: () => Promise<string>
): Effect.Effect<void> =>
  server.addTool({
    tool: toolDefinition(definition),
    annotations: contextForVisibility(visibility),
    handle: makeToolHandler(options, registries, exposureOptions, definition, admission, fetchLatestVersion)
  })

const registerAll = (
  options: EffectMcpRegistryOptions,
  registries: ProtocolToolRegistries,
  exposureOptions: ProtocolExposureOptions,
  admission: RequestAdmission,
  fetchLatestVersion: () => Promise<string>
): Effect.Effect<void, never, McpServer> =>
  Effect.gen(function* () {
    const server = yield* McpServer
    for (const definition of builtinToolDefinitions) {
      yield* registerTool(
        server,
        options,
        registries,
        exposureOptions,
        asToolDefinition(definition),
        () => true,
        admission,
        fetchLatestVersion
      )
    }
    for (const definition of proxyToolDefinitions) {
      yield* registerTool(
        server,
        options,
        registries,
        exposureOptions,
        definition,
        (payload) => initializeExposure(registries, exposureOptions, payload).context.resolvedMode === "proxy",
        admission,
        fetchLatestVersion
      )
    }
    for (const definition of registries.fullRegistry.definitions) {
      yield* registerTool(
        server,
        options,
        registries,
        exposureOptions,
        definition,
        (payload) => initializeExposure(registries, exposureOptions, payload).visibleNativeRegistry.tools.has(definition.name),
        admission,
        fetchLatestVersion
      )
    }
    yield* registerEffectMcpResourceTemplates(options.resolveClients, admission)
  })

const resolveExposureOptions = (options: EffectMcpRegistryOptions): ProtocolExposureOptions => {
  const defaults = defaultExposureOptions()
  const configured = options.exposureOptions
  return {
    exposureConfig: configured?.exposureConfig ?? defaults.exposureConfig,
    toolScopeFilteringActive: configured?.toolScopeFilteringActive ?? defaults.toolScopeFilteringActive,
    currentClientInfo: configured?.currentClientInfo ?? defaults.currentClientInfo
  }
}

/** Build an Effect AI registry and its transport-facing registration layer. */
export const makeEffectMcpRegistry = (options: EffectMcpRegistryOptions): EffectMcpRegistry => {
  const registries = normalizeRegistries(options.registry)
  const exposureOptions = resolveExposureOptions(options)
  const admission = options.admission ?? createRequestAdmission()
  const fetchLatestVersion = options.fetchLatestVersion ?? fetchLatestNpmVersion
  const registration = registerAll(options, registries, exposureOptions, admission, fetchLatestVersion)

  return {
    registration,
    layer: Layer.effectDiscard(registration),
    admission,
    quiesce: admission.quiesce
  }
}

/** Convenience alias for callers that only need a registration effect. */
export const registerEffectMcpRegistry = (
  options: EffectMcpRegistryOptions
): Effect.Effect<void, never, McpServer> => makeEffectMcpRegistry(options).registration
