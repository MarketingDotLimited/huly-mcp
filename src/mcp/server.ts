/**
 * Effect-native MCP server lifecycle.
 *
 * Protocol registration is supplied by `effect-ai-registry`; this module owns
 * transport layer composition, process lifecycle, and Huly runtime wiring.
 */
import { NodeStdio } from "@effect/platform-node"
import {
  Config,
  Context,
  Deferred,
  type Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  type Redacted,
  Ref,
  Schema,
  Scope
} from "effect"
import * as Stdio from "effect/Stdio"
import * as Stream from "effect/Stream"
import { McpProtocol, McpServer } from "effect/unstable/ai"
import type * as HttpMiddlewareModule from "effect/unstable/http/HttpMiddleware"
import * as HttpServerRequestModule from "effect/unstable/http/HttpServerRequest"

import { type SanitizedHulyRuntimeConfigContext, sanitizeHulyRuntimeConfigFromEnv } from "../config/config.js"
import type { GetHulyContextResult } from "../domain/schemas/index.js"
import type { ClientBundle, ClientResolver, HulyClientBundleError } from "../runtime/client-resolver.js"
import { VERSION } from "../version.js"
import { makeEffectMcpRegistry } from "./effect-ai-registry.js"
import {
  DEFAULT_HTTP_HOST,
  DEFAULT_HTTP_PORT,
  type HttpServerFactoryService,
  type HttpHost,
  type HttpPort,
  startHttpTransport,
  type HttpTransportConfig,
  type HttpTransportError
} from "./http-transport.js"
import { buildHulyContext, type ToolExposureContext } from "./huly-context-tool.js"
import { createRequestClientLifecycle, type RequestClientLease } from "./request-client-lifecycle.js"
import { McpRequestContextService } from "./request-context.js"
import {
  executeBoundedStdioShutdown,
  liveStdioProcessPort,
  makeStdioShutdownCoordinator,
  type StdioProcessPort,
  type StdioShutdownCoordinator,
  type StdioShutdownReason,
  type StdioShutdownResources
} from "./stdio-shutdown.js"
import { TelemetryService } from "../telemetry/telemetry.js"
import { writeStderrLine } from "../utils/stderr.js"
import {
  createHostedHulyMigrationNoticeProvider
} from "./tool-call-notices.js"
import { parseToolExposureConfig, type ToolExposureConfig } from "./tool-mode.js"
import { resolveToolScope } from "./tool-scope.js"
import { createScopedRegistry, toolRegistry } from "./tools/index.js"

export type { ClientBundle } from "../runtime/client-resolver.js"

export type McpTransportType = "stdio" | "http"

interface McpServerConfigData {
  readonly transport: McpTransportType
  readonly httpPort?: HttpPort
  readonly httpHost?: HttpHost
  readonly mcpAuthToken?: Redacted.Redacted<string>
  readonly shutdownGracePeriod?: Duration.Input
  readonly authMethod?: "token" | "password"
}

interface McpServerConfigCallbacks {
  readonly resolveClients: ClientResolver
  readonly resolveClientLeaseForHttpRequest?: (
    req: Request
  ) => Promise<RequestClientLease<Exit.Exit<ClientBundle, HulyClientBundleError>>>
  readonly getRuntimeConfigContext?: () => SanitizedHulyRuntimeConfigContext
  readonly getRuntimeConfigContextForHttpRequest?: (req: Request) => SanitizedHulyRuntimeConfigContext
  readonly closeClients?: () => Promise<void>
  readonly stdioProcess?: StdioProcessPort
  readonly writeError?: (message: string) => void
}

type McpServerConfig = McpServerConfigData & McpServerConfigCallbacks

export class McpServerError extends Schema.TaggedError<McpServerError>()("McpServerError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect())
}) {}

const defaultWriteError = (message: string): void => {
  writeStderrLine(message)
}

const parseToolExposureConfigEffect = (
  env: Parameters<typeof parseToolExposureConfig>[0]
): Effect.Effect<ToolExposureConfig, McpServerError> => {
  const parsed = parseToolExposureConfig(env)
  return parsed._tag === "Success"
    ? Effect.succeed(parsed.value)
    : Effect.fail(new McpServerError({ message: parsed.message }))
}

export interface McpServerOperations {
  readonly run: () => Effect.Effect<void, McpServerError, HttpServerFactoryService>
  readonly stop: () => Effect.Effect<void, McpServerError>
  readonly awaitReady: () => Effect.Effect<void, McpServerError>
}

interface McpServerRunControl {
  readonly shutdown: Deferred.Deferred<void>
  readonly done: Deferred.Deferred<void>
  readonly ready: Deferred.Deferred<void>
}

const DEFAULT_SHUTDOWN_GRACE_PERIOD = "5 seconds"

const requestShutdown = (coordinator: StdioShutdownCoordinator, reason: StdioShutdownReason): void => {
  Effect.runSync(coordinator.request(reason))
}

const awaitStdioLifecycleEvent = (
  coordinator: StdioShutdownCoordinator,
  stdioProcess: StdioProcessPort
): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    const listenerState = { remove: () => {} }
    const request = (reason: StdioShutdownReason) => {
      listenerState.remove()
      requestShutdown(coordinator, reason)
      resume(Effect.void)
    }
    listenerState.remove = stdioProcess.listen({
      stdinEof: () => request("stdin-eof"),
      stdinClose: () => request("stdin-close"),
      sigint: () => request("sigint"),
      sigterm: () => request("sigterm")
    })
    return Effect.sync(() => listenerState.remove())
  })

const optionalPromiseCleanup = (cleanup: (() => Promise<void>) | undefined): Effect.Effect<void, McpServerError> =>
  cleanup === undefined
    ? Effect.void
    : Effect.tryPromise({
        try: cleanup,
        catch: (cause) => new McpServerError({ message: "client cleanup failed", cause })
      })

const registryDrain = (quiesce: () => Promise<void>): Effect.Effect<void, McpServerError> =>
  Effect.tryPromise({
    try: quiesce,
    catch: (cause) => new McpServerError({ message: "in-flight request drain failed", cause })
  })

const protocolOptions = {
  name: "huly-mcp",
  version: VERSION,
  protocols: [McpProtocol.v2025_06_18] as const
}

/**
 * Effect AI's stdio protocol interrupts its build fiber when the input stream
 * completes. EOF ownership is coordinated by `StdioProcessPort` instead, so
 * keep the protocol input alive long enough for already-admitted responses to
 * flush before the transport scope is closed.
 */
const nodeStdioLayer = Layer.effect(
  Stdio.Stdio,
  Effect.gen(function*() {
    const stdio = yield* Stdio.Stdio
    return Stdio.make({
      args: stdio.args,
      stdinIsTerminal: stdio.stdinIsTerminal,
      stdoutIsTerminal: stdio.stdoutIsTerminal,
      stdout: (options) => stdio.stdout(options),
      stderr: (options) => stdio.stderr(options),
      stdin: Stream.concat(stdio.stdin, Stream.never)
    })
  }).pipe(Effect.provide(NodeStdio.layer))
)

const webRequestFromHttpRequest = (request: HttpServerRequestModule.HttpServerRequest): Request => {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) headers.set(name, value)
  const url = /^[a-z][a-z\d+.-]*:/iu.test(request.url) ? request.url : `http://localhost${request.url}`
  return new Request(url, { method: request.method, headers })
}

const requestContextMiddleware = (config: McpServerConfig): HttpMiddlewareModule.HttpMiddleware => (httpEffect) =>
  Effect.gen(function*() {
    const request = yield* HttpServerRequestModule.HttpServerRequest
    const webRequest = webRequestFromHttpRequest(request)
    const runtimeConfig =
      config.getRuntimeConfigContextForHttpRequest?.(webRequest) ??
      config.getRuntimeConfigContext?.() ??
      sanitizeHulyRuntimeConfigFromEnv(process.env)
    const resolveLease =
      config.resolveClientLeaseForHttpRequest ??
      ((_request: Request) =>
        config.resolveClients().then((bundle) => ({
          bundle,
          close: () => {}
        })))
    const lifecycle = createRequestClientLifecycle(() => resolveLease(webRequest))
    const requestContext = McpRequestContextService.of({
      runtimeConfig,
      resolveClients: lifecycle.resolve
    })
    return yield* Effect.acquireUseRelease(
      Effect.succeed(requestContext),
      (context) => Effect.provideService(httpEffect, McpRequestContextService, context),
      () => Effect.promise(lifecycle.close).pipe(Effect.ignore)
    )
  })

const buildStdioLayer = (
  registryLayer: Layer.Layer<never, never, McpServer.McpServer>
): Layer.Layer<never, never, never> =>
  registryLayer.pipe(
    Layer.provide(McpServer.layerStdio(protocolOptions).pipe(Layer.orDie)),
    Layer.provide(nodeStdioLayer)
  )

const buildHttpLayer = (
  registryLayer: Layer.Layer<never, never, McpServer.McpServer>
) =>
  registryLayer.pipe(
    Layer.provide(
      McpServer.layerHttp({
        ...protocolOptions,
        path: "/mcp"
      }).pipe(Layer.orDie)
    )
  )

export class McpServerService extends Context.Service<McpServerService, McpServerOperations>()("@hulymcp/McpServer") {
  static layer(config: McpServerConfig): Layer.Layer<McpServerService, McpServerError, TelemetryService> {
    return Layer.effect(
      McpServerService,
      Effect.gen(function*() {
        const telemetry = yield* TelemetryService
        const writeError = config.writeError ?? defaultWriteError
        const toolsetsRaw = yield* Effect.orElseSucceed(Config.string("TOOLSETS"), () => "")
        const toolsRaw = yield* Effect.orElseSucceed(Config.string("TOOLS"), () => "")
        const hulyToolModeRaw = yield* Effect.orElseSucceed(
          Config.string("HULY_TOOL_MODE"),
          (): string | undefined => undefined
        )
        const proxyOutputStrictRaw = yield* Effect.orElseSucceed(
          Config.string("PROXY_OUTPUT_STRICT"),
          (): string | undefined => undefined
        )
        const exposureConfig = yield* parseToolExposureConfigEffect({
          ...(hulyToolModeRaw === undefined ? {} : { hulyToolMode: hulyToolModeRaw }),
          ...(proxyOutputStrictRaw === undefined ? {} : { proxyOutputStrict: proxyOutputStrictRaw })
        })
        const toolScope = resolveToolScope(
          { toolsets: toolsetsRaw, tools: toolsRaw },
          toolRegistry.definitions,
          writeError
        )
        const scopedNativeRegistry = createScopedRegistry({
          filteringActive: toolScope.filteringActive,
          categories: toolScope.enabledCategories,
          toolNames: toolScope.enabledToolNames
        })
        const registries = { fullRegistry: toolRegistry, scopedNativeRegistry }
        const getRuntimeConfigContext =
          config.getRuntimeConfigContext ?? (() => sanitizeHulyRuntimeConfigFromEnv(process.env))
        const getHulyContext = (
          runtimeConfig: SanitizedHulyRuntimeConfigContext,
          toolExposure: ToolExposureContext
        ): GetHulyContextResult =>
          buildHulyContext(config, scopedNativeRegistry, toolScope, runtimeConfig, toolExposure)
        const toolsets = toolScope.filteringActive ? toolScope.enabledToolsets : null
        telemetry.sessionStart({
          transport: config.transport,
          authMethod: config.authMethod ?? "password",
          toolCount: scopedNativeRegistry.definitions.length,
          toolsets
        })
        const runControlRef = yield* Ref.make<McpServerRunControl | null>(null)

        const operations: McpServerOperations = {
          run: () =>
            Effect.gen(function*() {
              const control: McpServerRunControl = {
                shutdown: yield* Deferred.make<void>(),
                done: yield* Deferred.make<void>(),
                ready: yield* Deferred.make<void>()
              }
              const claimed = yield* Ref.modify(runControlRef, (current) =>
                current === null ? [true, control] : [false, current]
              )
              if (!claimed) return yield* new McpServerError({ message: "MCP server is already running" })

              yield* Effect.gen(function*() {
                const runtimeConfig = getRuntimeConfigContext()
                const registry = makeEffectMcpRegistry({
                  resolveClients: config.resolveClients,
                  telemetry,
                  registry: registries,
                  getHulyContext: (exposure) => getHulyContext(runtimeConfig, exposure),
                  exposureOptions: { exposureConfig, toolScopeFilteringActive: toolScope.filteringActive },
                  toolCallNoticeProvider: createHostedHulyMigrationNoticeProvider({
                    delivery: config.transport === "http" ? "always" : "once",
                    hulyOrigin: runtimeConfig.huly.url.origin
                  })
                })

                if (config.transport === "stdio") {
                  const transportScope = yield* Scope.make()
                  const coordinator = yield* makeStdioShutdownCoordinator(() => {
                    void registry.quiesce()
                  })
                  const stdioProcess = config.stdioProcess ?? liveStdioProcessPort
                  const stdioLifecycleFiber = yield* awaitStdioLifecycleEvent(coordinator, stdioProcess).pipe(
                    Effect.forkIn(transportScope, { startImmediately: true })
                  )
                  const shutdownResources: StdioShutdownResources = {
                    drain: registryDrain(registry.quiesce),
                    closeWire: Scope.close(transportScope, Exit.void),
                    closeTelemetry: Effect.tryPromise({
                      try: () => telemetry.shutdown(),
                      catch: (cause) => new McpServerError({ message: "telemetry close failed", cause })
                    }),
                    closeClients: optionalPromiseCleanup(config.closeClients),
                    forceExit: (code) => Effect.sync(() => stdioProcess.forceExit(code)),
                    writeDiagnostic: (message) => Effect.sync(() => writeError(message))
                  }
                  const stdioLayerFiber = yield* Layer.buildWithScope(
                    buildStdioLayer(registry.layer),
                    transportScope
                  ).pipe(Effect.forkIn(transportScope, { startImmediately: true }))
                  yield* Fiber.join(stdioLayerFiber)
                  yield* Deferred.succeed(control.ready, undefined)
                  yield* Effect.raceFirst(
                    Fiber.join(stdioLifecycleFiber),
                    Deferred.await(control.shutdown)
                  ).pipe(
                    Effect.ensuring(
                      coordinator
                        .request("runtime-interruption")
                        .pipe(Effect.andThen(executeBoundedStdioShutdown(coordinator, shutdownResources)))
                    )
                  )
                } else {
                  const host = config.httpHost ?? DEFAULT_HTTP_HOST
                  const port = config.httpPort ?? DEFAULT_HTTP_PORT
                  const appLayer = buildHttpLayer(registry.layer)
                  const httpConfig: HttpTransportConfig = {
                    host,
                    port,
                    ...(config.mcpAuthToken === undefined ? {} : { authToken: config.mcpAuthToken }),
                    middleware: requestContextMiddleware(config),
                    shutdown: Deferred.await(control.shutdown),
                    onReady: () => Deferred.succeed(control.ready, undefined),
                    onShutdown: () => Effect.ignore(registryDrain(registry.quiesce)),
                    shutdownGracePeriod: config.shutdownGracePeriod ?? DEFAULT_SHUTDOWN_GRACE_PERIOD
                  }
                  yield* startHttpTransport(httpConfig, appLayer, writeError).pipe(
                    Effect.mapError((error: HttpTransportError) =>
                      new McpServerError({ message: error.message, cause: error.cause })
                    )
                  )
                }
              }).pipe(
                Effect.ensuring(
                  Effect.gen(function*() {
                    yield* Ref.set(runControlRef, null)
                    yield* Deferred.succeed(control.done, undefined)
                  })
                )
              ).pipe(Effect.asVoid)
            }),
          stop: () =>
            Effect.gen(function*() {
              const control = yield* Ref.get(runControlRef)
              if (control === null) return
              yield* Deferred.succeed(control.shutdown, undefined)
              yield* Deferred.await(control.done)
            }),
          awaitReady: () =>
            Effect.gen(function*() {
              const control = yield* Ref.get(runControlRef)
              if (control === null) return yield* new McpServerError({ message: "MCP server is not running" })
              yield* Deferred.await(control.ready)
            })
        }
        return operations
      })
    )
  }

  static testLayer(mockOperations: Partial<McpServerOperations>): Layer.Layer<McpServerService> {
    const defaults: McpServerOperations = {
      run: () => Effect.void,
      stop: () => Effect.void,
      awaitReady: () => Effect.void
    }
    return Layer.succeed(McpServerService, { ...defaults, ...mockOperations })
  }
}
