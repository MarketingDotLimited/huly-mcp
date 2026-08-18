import { describe, it } from "@effect/vitest"
import { Context, Effect, Exit, Fiber, Layer } from "effect"
import { expect } from "vitest"

import { sanitizeHulyRuntimeConfigFromEnv } from "../../src/config/config.js"
import { HulyClient } from "../../src/huly/client.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { HttpServerFactoryService } from "../../src/mcp/http-transport.js"
import { McpServerService } from "../../src/mcp/server.js"
import type { StdioProcessPort, StdioShutdownHandlers } from "../../src/mcp/stdio-shutdown.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"
import { inertHttpServerFactory } from "./http-test-support.js"

const runtimeEnv = {
  HULY_URL: "https://huly.example.com",
  HULY_WORKSPACE: "workspace",
  HULY_TOKEN: "test-token"
}

class RecordingStdioProcess implements StdioProcessPort {
  private handlers: StdioShutdownHandlers | undefined
  readonly forcedExitCodes: Array<1> = []

  listen(handlers: StdioShutdownHandlers): () => void {
    this.handlers = handlers
    return () => {
      if (this.handlers === handlers) this.handlers = undefined
    }
  }

  forceExit(code: 1): void {
    this.forcedExitCodes.push(code)
  }

  emitEof(): void {
    this.handlers?.stdinEof()
  }

  emitSigterm(): void {
    this.handlers?.sigterm()
  }
}

const makeBundle = Effect.fn("makeBundle")(function*() {
  const context = yield* Layer.build(
    Layer.mergeAll(HulyClient.testLayer({}), HulyStorageClient.testLayer({}))
  )
  return {
    hulyClient: Context.get(context, HulyClient),
    storageClient: Context.get(context, HulyStorageClient)
  }
})

const buildOperations = Effect.fn("buildOperations")(function* (stdioProcess: StdioProcessPort) {
  const bundle = yield* makeBundle()
  const layer = McpServerService.layer({
    transport: "stdio",
    resolveClients: async () => Exit.succeed(bundle),
    stdioProcess,
    getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv)
  }).pipe(Layer.provide(TelemetryService.testLayer()))
  const context = yield* Layer.build(layer)
  return Context.get(context, McpServerService)
})

const runReady = Effect.fn("runReady")(function* (operations: McpServerService["Service"]) {
  const fiber = yield* operations
    .run()
    .pipe(
      Effect.provideService(HttpServerFactoryService, inertHttpServerFactory("HTTP is outside this test")),
      Effect.forkScoped({ startImmediately: true })
    )
  yield* operations.awaitReady()
  return fiber
})

describe("McpServerService Effect stdio lifecycle", () => {
  it.effect("stops cleanly through the owner operation", () =>
    Effect.gen(function*() {
      const process = new RecordingStdioProcess()
      const operations = yield* buildOperations(process)
      const fiber = yield* runReady(operations)

      yield* operations.stop()
      yield* Fiber.join(fiber)

      expect(process.forcedExitCodes).toEqual([])
    }))

  it.effect("treats EOF as ownership loss and completes successfully", () =>
    Effect.gen(function*() {
      const process = new RecordingStdioProcess()
      const operations = yield* buildOperations(process)
      const fiber = yield* runReady(operations)

      process.emitEof()
      yield* Fiber.join(fiber)

      expect(process.forcedExitCodes).toEqual([])
    }))

  it.effect("coalesces signal and EOF requests", () =>
    Effect.gen(function*() {
      const process = new RecordingStdioProcess()
      const operations = yield* buildOperations(process)
      const fiber = yield* runReady(operations)

      process.emitEof()
      process.emitSigterm()
      yield* operations.stop()
      yield* Fiber.join(fiber)

      expect(process.forcedExitCodes).toEqual([])
    }))

  it.effect("reports awaitReady before startup as a typed error", () =>
    Effect.gen(function*() {
      const process = new RecordingStdioProcess()
      const operations = yield* buildOperations(process)
      const error = yield* operations.awaitReady().pipe(Effect.flip)

      expect(error._tag).toBe("McpServerError")
      expect(error.message).toBe("MCP server is not running")
    }))
})
