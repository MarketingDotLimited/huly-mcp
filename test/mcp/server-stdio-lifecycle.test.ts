import { PassThrough } from "node:stream"

import { describe, it } from "@effect/vitest"
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio"
import { Context, Deferred, Effect, Exit, Fiber, Layer } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"

import { sanitizeHulyRuntimeConfigFromEnv } from "../../src/config/config.js"
import { HulyClient } from "../../src/huly/client.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import { HttpServerFactoryService } from "../../src/mcp/http-transport.js"
import { createDefaultMcpSdkServer } from "../../src/mcp/sdk-server.js"
import { McpServerService } from "../../src/mcp/server.js"
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
  readonly telemetryShutdown?: () => Promise<void>
}) {
  const bundle = yield* makeClientBundle()
  const layer = McpServerService.layer({
    transport: "stdio",
    shutdownGracePeriod: "5 seconds",
    resolveClients: async () => Exit.succeed(bundle),
    createServer: createDefaultMcpSdkServer,
    createStdioTransport: () => options.transport,
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

  it.effect("bounds a stuck wire close with the Effect clock", () =>
    Effect.gen(function* () {
      const errors: Array<string> = []
      const closeStarted = yield* Deferred.make<void>()
      const transport = new CloseProbeTransport(new PassThrough(), new PassThrough(), () => {
        Effect.runSync(Deferred.succeed(closeStarted, undefined))
        return new Promise(() => {})
      })
      const operations = yield* buildOperations({ transport, errors })
      const fiber = yield* runServer(operations)

      process.stdin.emit("end")
      yield* Deferred.await(closeStarted)
      yield* TestClock.adjust("5 seconds")
      yield* Fiber.join(fiber)

      expect(errors).toEqual(["MCP stdio wire close timed out during shutdown"])
      expect(transport.closeCount).toBe(1)
    })
  )

  it.effect("bounds telemetry shutdown before closing the wire", () =>
    Effect.gen(function* () {
      const errors: Array<string> = []
      const telemetryStarted = yield* Deferred.make<void>()
      const transport = new CloseProbeTransport(new PassThrough(), new PassThrough(), async () => {})
      const operations = yield* buildOperations({
        transport,
        errors,
        telemetryShutdown: () => {
          Effect.runSync(Deferred.succeed(telemetryStarted, undefined))
          return new Promise(() => {})
        }
      })
      const fiber = yield* runServer(operations)

      process.emit("SIGTERM")
      yield* Deferred.await(telemetryStarted)
      yield* TestClock.adjust("5 seconds")
      yield* Fiber.join(fiber)

      expect(errors).toEqual(["MCP stdio telemetry flush timed out during shutdown"])
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
})
