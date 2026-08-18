import { PassThrough } from "node:stream"

import { describe, it } from "@effect/vitest"
import { Server } from "@modelcontextprotocol/server"
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio"
import { Context, Deferred, Effect, Exit, Fiber, Latch, Layer } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"

import { sanitizeHulyRuntimeConfigFromEnv } from "../../src/config/config.js"
import { HulyClient } from "../../src/huly/client.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import { HttpServerFactoryService } from "../../src/mcp/http-transport.js"
import { createDefaultMcpSdkServer } from "../../src/mcp/sdk-server.js"
import { type ClientBundle, McpServerService } from "../../src/mcp/server.js"
import type { StdioProcessPort, StdioShutdownHandlers } from "../../src/mcp/stdio-shutdown.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"
import { inertHttpServerFactory } from "./http-test-support.js"

const runtimeEnv = { HULY_URL: "https://huly.example.com", HULY_WORKSPACE: "workspace", HULY_TOKEN: "test-token" }
const unusedHttpFactory = inertHttpServerFactory("HTTP is outside this stdio test")

const makeClientBundle = Effect.fn("makeClientBundle")(function* () {
  const layer = Layer.mergeAll(HulyClient.testLayer({}), HulyStorageClient.testLayer({}), WorkspaceClient.testLayer({}))
  const context = yield* Layer.build(layer)
  return {
    hulyClient: Context.get(context, HulyClient),
    storageClient: Context.get(context, HulyStorageClient),
    workspaceClient: Context.get(context, WorkspaceClient)
  }
})

class CloseProbeTransport extends StdioServerTransport {
  closeCount = 0

  constructor(
    input: PassThrough,
    output: PassThrough,
    private readonly closeResult: () => Promise<void>
  ) {
    super(input, output)
  }

  override close(): Promise<void> {
    this.closeCount += 1
    return this.closeResult()
  }
}

const buildOperations = Effect.fn("buildOperations")(function* (options: {
  readonly transport: StdioServerTransport
  readonly errors?: Array<string>
  readonly stdioProcess?: StdioProcessPort
  readonly telemetryShutdown?: () => Promise<void>
}) {
  const bundle = yield* makeClientBundle()
  const layer = McpServerService.layer({
    transport: "stdio",
    shutdownGracePeriod: "5 seconds",
    resolveClients: async () => Exit.succeed(bundle),
    createServer: createDefaultMcpSdkServer,
    createStdioTransport: () => options.transport,
    ...(options.stdioProcess === undefined ? {} : { stdioProcess: options.stdioProcess }),
    writeError: (message) => options.errors?.push(message),
    getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv)
  }).pipe(
    Layer.provide(
      TelemetryService.testLayer(options.telemetryShutdown === undefined ? {} : { shutdown: options.telemetryShutdown })
    )
  )
  const context = yield* Layer.build(layer)
  return Context.get(context, McpServerService)
})

const runServer = Effect.fn("runServer")(function* (operations: McpServerService["Service"]) {
  const fiber = yield* operations
    .run()
    .pipe(
      Effect.provideService(HttpServerFactoryService, unusedHttpFactory),
      Effect.forkScoped({ startImmediately: true })
    )
  yield* operations.awaitReady()
  return fiber
})

describe("McpServerService released stdio lifecycle", () => {
  it.effect("drains a produced final-protocol response before closing the wire", () =>
    Effect.gen(function* () {
      const responseWritten = yield* Deferred.make<void>()
      const input = new PassThrough()
      const output = new PassThrough()
      output.once("data", () => {
        Effect.runSync(Deferred.succeed(responseWritten, undefined))
      })
      input.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "server/discover",
          params: {
            _meta: {
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
              "io.modelcontextprotocol/clientCapabilities": {}
            }
          }
        })}\n`
      )
      const transport = new CloseProbeTransport(input, output, async () => {})
      const operations = yield* buildOperations({ transport })
      const fiber = yield* runServer(operations)

      yield* Deferred.await(responseWritten)
      process.stdin.emit("end")
      yield* Fiber.join(fiber)

      expect(transport.closeCount).toBe(1)
    })
  )

  it.effect("treats stdin EOF as ownership loss with the safe default", () =>
    Effect.gen(function* () {
      const input = new PassThrough()
      const transport = new CloseProbeTransport(input, new PassThrough(), async () => {})
      const operations = yield* buildOperations({ transport })
      const fiber = yield* runServer(operations)

      process.stdin.emit("end")
      yield* Fiber.join(fiber)

      expect(transport.closeCount).toBe(1)
    })
  )

  it.effect("coalesces racing EOF and signals into one shutdown", () =>
    Effect.gen(function* () {
      const transport = new CloseProbeTransport(new PassThrough(), new PassThrough(), async () => {})
      const operations = yield* buildOperations({ transport })
      const fiber = yield* runServer(operations)

      process.stdin.emit("end")
      process.stdin.emit("close")
      process.emit("SIGTERM")
      yield* operations.stop()
      yield* Fiber.join(fiber)

      expect(transport.closeCount).toBe(1)
    })
  )

  it.effect("forces exit when a stuck wire close reaches the global deadline", () =>
    Effect.gen(function* () {
      const errors: Array<string> = []
      const stdioProcess = new RecordingStdioProcess()
      const closeStarted = yield* Deferred.make<void>()
      const transport = new CloseProbeTransport(new PassThrough(), new PassThrough(), () => {
        Effect.runSync(Deferred.succeed(closeStarted, undefined))
        return new Promise(() => {})
      })
      const operations = yield* buildOperations({ transport, errors, stdioProcess })
      const fiber = yield* runServer(operations)

      yield* Effect.promise(() => stdioProcess.awaitListening())
      stdioProcess.emitEof()
      yield* Deferred.await(closeStarted)
      yield* TestClock.adjust("10 seconds")
      yield* Fiber.join(fiber)

      expect(errors).toEqual(["Huly MCP stdio shutdown exceeded 10 seconds; forcing process exit"])
      expect(stdioProcess.forcedExitCodes).toEqual([1])
      expect(transport.closeCount).toBe(1)
    })
  )

  it.effect("forces exit when telemetry shutdown reaches the global deadline", () =>
    Effect.gen(function* () {
      const errors: Array<string> = []
      const stdioProcess = new RecordingStdioProcess()
      const telemetryStarted = yield* Deferred.make<void>()
      const transport = new CloseProbeTransport(new PassThrough(), new PassThrough(), async () => {})
      const operations = yield* buildOperations({
        transport,
        errors,
        stdioProcess,
        telemetryShutdown: () => {
          Effect.runSync(Deferred.succeed(telemetryStarted, undefined))
          return new Promise(() => {})
        }
      })
      const fiber = yield* runServer(operations)

      yield* Effect.promise(() => stdioProcess.awaitListening())
      stdioProcess.emitSigterm()
      yield* Deferred.await(telemetryStarted)
      yield* TestClock.adjust("10 seconds")
      yield* Fiber.join(fiber)

      expect(errors).toEqual(["Huly MCP stdio shutdown exceeded 10 seconds; forcing process exit"])
      expect(stdioProcess.forcedExitCodes).toEqual([1])
      expect(transport.closeCount).toBe(1)
    })
  )

  it.effect("sanitizes wire-close failures on stderr", () =>
    Effect.gen(function* () {
      const errors: Array<string> = []
      const transport = new CloseProbeTransport(new PassThrough(), new PassThrough(), () =>
        Promise.reject(new Error("secret-token"))
      )
      const operations = yield* buildOperations({ transport, errors })
      const fiber = yield* runServer(operations)

      process.stdin.emit("end")
      yield* Fiber.join(fiber)

      expect(errors).toEqual(["MCP stdio handler error"])
      expect(errors.join(" ")).not.toContain("secret-token")
    })
  )

  class RecordingStdioProcess implements StdioProcessPort {
    private handlers: StdioShutdownHandlers | null = null
    private readonly waiters = new Set<() => void>()
    readonly forcedExitCodes: Array<1> = []
    listenerRegistrations = 0

    listen(handlers: StdioShutdownHandlers): () => void {
      this.handlers = handlers
      this.listenerRegistrations++
      for (const resolve of this.waiters) resolve()
      this.waiters.clear()
      return () => {
        if (this.handlers === handlers) this.handlers = null
      }
    }

    forceExit(code: 1): void {
      this.forcedExitCodes.push(code)
    }

    awaitListening(): Promise<void> {
      return this.handlers === null ? new Promise((resolve) => this.waiters.add(resolve)) : Promise.resolve()
    }

    emitEof(): void {
      this.handlers?.stdinEof()
    }

    emitSigterm(): void {
      this.handlers?.sigterm()
    }
  }

  class CountingCloseTransport extends StdioServerTransport {
    closes = 0

    override close(): Promise<void> {
      this.closes++
      return super.close()
    }
  }

  class CountingSdkServer extends Server {
    closes = 0

    constructor() {
      super({ name: "shutdown-test", version: "1.0.0" }, { capabilities: { resources: {}, tools: {} } })
    }

    override close(): Promise<void> {
      this.closes++
      return super.close()
    }
  }

  it("treats EOF as unconditional ownership loss and coalesces a racing signal", async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const transport = new CountingCloseTransport(input, output)
    const stdioProcess = new RecordingStdioProcess()
    const bundle = await Effect.runPromise(makeClientBundle().pipe(Effect.scoped))
    let telemetryCloses = 0
    let clientCloses = 0
    const sdkServers: Array<CountingSdkServer> = []
    const sdkCreatedState = { resolve: () => {} }
    const sdkCreated = new Promise<void>((resolve) => {
      sdkCreatedState.resolve = resolve
    })
    const layer = McpServerService.layer({
      transport: "stdio",
      resolveClients: async () => Exit.succeed(bundle),
      closeClients: async () => {
        clientCloses++
      },
      createServer: () => {
        const server = new CountingSdkServer()
        sdkServers.push(server)
        sdkCreatedState.resolve()
        return server
      },
      createStdioTransport: () => transport,
      stdioProcess,
      getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv)
    }).pipe(
      Layer.provide(
        TelemetryService.testLayer({
          shutdown: async () => {
            telemetryCloses++
          }
        })
      )
    )
    const context = await Effect.runPromise(Layer.build(layer).pipe(Effect.scoped))
    const operations = Context.get(context, McpServerService)
    const fiber = Effect.runFork(
      operations.run().pipe(Effect.provideService(HttpServerFactoryService, unusedHttpFactory))
    )

    await stdioProcess.awaitListening()
    input.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "server/discover",
        params: {
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {}
          }
        }
      })}\n`
    )
    await sdkCreated
    stdioProcess.emitEof()
    stdioProcess.emitSigterm()
    await Effect.runPromise(Fiber.join(fiber))

    expect(transport.closes).toBe(1)
    expect(sdkServers).toHaveLength(1)
    expect(sdkServers[0]?.closes).toBe(1)
    expect(telemetryCloses).toBe(1)
    expect(clientCloses).toBe(1)
    expect(stdioProcess.forcedExitCodes).toEqual([])
  })

  it.effect("forces one exit when a top-level external close exceeds the global deadline", () =>
    Effect.gen(function* () {
      const stdioProcess = new RecordingStdioProcess()
      const errors: Array<string> = []
      const bundle = yield* makeClientBundle()
      const neverCloses = new Promise<void>(() => {})
      const layer = McpServerService.layer({
        transport: "stdio",
        resolveClients: async () => Exit.succeed(bundle),
        closeClients: () => neverCloses,
        createServer: createDefaultMcpSdkServer,
        createStdioTransport: () => new StdioServerTransport(new PassThrough(), new PassThrough()),
        stdioProcess,
        writeError: (message) => errors.push(message),
        getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv)
      }).pipe(Layer.provide(TelemetryService.testLayer()))
      const context = yield* Layer.build(layer)
      const operations = Context.get(context, McpServerService)
      const fiber = yield* operations
        .run()
        .pipe(
          Effect.provideService(HttpServerFactoryService, unusedHttpFactory),
          Effect.forkScoped({ startImmediately: true })
        )

      yield* Effect.promise(() => stdioProcess.awaitListening())
      yield* Effect.sync(() => stdioProcess.emitEof())
      yield* TestClock.adjust("10 seconds")
      yield* Fiber.join(fiber)

      expect(stdioProcess.forcedExitCodes).toEqual([1])
      expect(errors).toEqual(["Huly MCP stdio shutdown exceeded 10 seconds; forcing process exit"])
    })
  )

  it.effect("abandons an accepted request after its allowance and still completes before the global deadline", () =>
    Effect.gen(function* () {
      const input = new PassThrough()
      const output = new PassThrough()
      const stdioProcess = new RecordingStdioProcess()
      const requestStarted = yield* Latch.make(false)
      const neverResolves = new Promise<Exit.Exit<ClientBundle, never>>(() => {})
      const errors: Array<string> = []
      const layer = McpServerService.layer({
        transport: "stdio",
        resolveClients: () => {
          Effect.runSync(requestStarted.open)
          return neverResolves
        },
        createServer: createDefaultMcpSdkServer,
        createStdioTransport: () => new StdioServerTransport(input, output),
        stdioProcess,
        writeError: (message) => errors.push(message),
        getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv)
      }).pipe(Layer.provide(TelemetryService.testLayer()))
      const context = yield* Layer.build(layer)
      const operations = Context.get(context, McpServerService)
      const fiber = yield* operations
        .run()
        .pipe(
          Effect.provideService(HttpServerFactoryService, unusedHttpFactory),
          Effect.forkScoped({ startImmediately: true })
        )

      yield* Effect.promise(() => stdioProcess.awaitListening())
      yield* Effect.sync(() => {
        input.write(
          `${JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-06-18",
              capabilities: {},
              clientInfo: { name: "shutdown-test", version: "1.0.0" }
            }
          })}\n`
        )
        input.write(
          `${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_projects", arguments: {} } })}\n`
        )
      })
      yield* requestStarted.await
      yield* Effect.sync(() => stdioProcess.emitEof())
      yield* Effect.yieldNow
      yield* TestClock.adjust("10 seconds")
      yield* Fiber.join(fiber)

      expect(stdioProcess.forcedExitCodes).toEqual([])
      expect(errors).not.toContain("Huly MCP stdio shutdown exceeded 10 seconds; forcing process exit")
    })
  )
})
