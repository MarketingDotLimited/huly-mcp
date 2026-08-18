import { describe, it } from "@effect/vitest"
import { Context, Effect, Exit, Fiber, Layer } from "effect"
import { expect } from "vitest"

import { sanitizeHulyRuntimeConfigFromEnv } from "../../src/config/config.js"
import { HulyClient } from "../../src/huly/client.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { HttpServerFactoryService } from "../../src/mcp/http-transport.js"
import { McpServerError, McpServerService } from "../../src/mcp/server.js"
import type { StdioProcessPort, StdioShutdownHandlers } from "../../src/mcp/stdio-shutdown.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"
import { inertHttpServerFactory } from "./http-test-support.js"

const runtimeEnv = {
  HULY_URL: "https://huly.example.com",
  HULY_WORKSPACE: "workspace",
  HULY_TOKEN: "test-token"
}

class TestStdioProcess implements StdioProcessPort {
  private handlers: StdioShutdownHandlers | undefined

  listen(handlers: StdioShutdownHandlers): () => void {
    this.handlers = handlers
    return () => {
      if (this.handlers === handlers) this.handlers = undefined
    }
  }

  forceExit(_code: 1): void {}
}

const buildOperations = Effect.fn("buildServerOperations")(function*() {
  const clients = yield* Layer.build(Layer.mergeAll(HulyClient.testLayer({}), HulyStorageClient.testLayer({})))
  const bundle = {
    hulyClient: Context.get(clients, HulyClient),
    storageClient: Context.get(clients, HulyStorageClient)
  }
  const layer = McpServerService.layer({
    transport: "stdio",
    resolveClients: async () => Exit.succeed(bundle),
    stdioProcess: new TestStdioProcess(),
    getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv)
  }).pipe(Layer.provide(TelemetryService.testLayer()))
  const context = yield* Layer.build(layer)
  return Context.get(context, McpServerService)
})

const runReady = Effect.fn("runServerReady")(function* (operations: McpServerService["Service"]) {
  const fiber = yield* operations
    .run()
    .pipe(
      Effect.provideService(HttpServerFactoryService, inertHttpServerFactory("HTTP is outside this test")),
      Effect.forkScoped({ startImmediately: true })
    )
  yield* operations.awaitReady()
  return fiber
})

describe("McpServerService operations", () => {
  it.effect("stop is a no-op when the server has not started", () =>
    Effect.gen(function*() {
      const operations = yield* buildOperations()
      yield* operations.stop()
    }))

  it.effect("awaitReady fails with a typed lifecycle error before startup", () =>
    Effect.gen(function*() {
      const operations = yield* buildOperations()
      const error = yield* operations.awaitReady().pipe(Effect.flip)

      expect(error).toBeInstanceOf(McpServerError)
      expect(error.message).toBe("MCP server is not running")
    }))

  it.effect("rejects a second concurrent run and releases the first run", () =>
    Effect.gen(function*() {
      const operations = yield* buildOperations()
      const first = yield* runReady(operations)

      const secondError = yield* operations.run().pipe(
        Effect.provideService(HttpServerFactoryService, inertHttpServerFactory("HTTP is outside this test")),
        Effect.flip
      )
      expect(secondError).toBeInstanceOf(McpServerError)
      expect(secondError.message).toBe("MCP server is already running")

      yield* operations.stop()
      yield* Fiber.join(first)
    }))
})
