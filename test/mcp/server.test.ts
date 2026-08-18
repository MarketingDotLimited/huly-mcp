import { describe, it } from "@effect/vitest"
import { Context, Effect, Exit, Fiber, Layer } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"

import { sanitizeHulyRuntimeConfigFromEnv } from "../../src/config/config.js"
import { HulyClient } from "../../src/huly/client.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { HttpServerFactoryService } from "../../src/mcp/http-transport.js"
import { McpServerError, McpServerService } from "../../src/mcp/server.js"
import type { StdioProcessPort, StdioShutdownHandlers } from "../../src/mcp/stdio-shutdown.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"
import { inertHttpServerFactory } from "./http-test-support.js"

const runtimeEnv = { HULY_URL: "https://huly.example.com", HULY_WORKSPACE: "workspace", HULY_TOKEN: "test-token" }

class TestStdioProcess implements StdioProcessPort {
  private handlers: StdioShutdownHandlers | undefined

  listen(handlers: StdioShutdownHandlers): () => void {
    this.handlers = handlers
    return () => {
      if (this.handlers === handlers) this.handlers = undefined
    }
  }

  forceExit(_code: 1): void {}

  trigger(reason: "stdin-eof" | "stdin-close" | "sigint" | "sigterm"): void {
    if (reason === "stdin-eof") this.handlers?.stdinEof()
    else if (reason === "stdin-close") this.handlers?.stdinClose()
    else if (reason === "sigint") this.handlers?.sigint()
    else this.handlers?.sigterm()
  }
}

const buildOperations = Effect.fn("buildServerOperations")(function* (
  stdioProcess = new TestStdioProcess(),
  closeClients?: () => Promise<void>,
  useLiveStdio = false
) {
  const clients = yield* Layer.build(Layer.mergeAll(HulyClient.testLayer({}), HulyStorageClient.testLayer({})))
  const bundle = {
    hulyClient: Context.get(clients, HulyClient),
    storageClient: Context.get(clients, HulyStorageClient)
  }
  const layer = McpServerService.layer({
    transport: "stdio",
    resolveClients: async () => Exit.succeed(bundle),
    ...(useLiveStdio ? {} : { stdioProcess }),
    ...(closeClients === undefined ? {} : { closeClients }),
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
    Effect.gen(function* () {
      const operations = yield* buildOperations()
      yield* operations.stop()
    })
  )

  it.effect("awaitReady fails with a typed lifecycle error before startup", () =>
    Effect.gen(function* () {
      const operations = yield* buildOperations()
      const error = yield* operations.awaitReady().pipe(Effect.flip)

      expect(error).toBeInstanceOf(McpServerError)
      expect(error.message).toBe("MCP server is not running")
    })
  )

  it.effect("rejects a second concurrent run and releases the first run", () =>
    Effect.gen(function* () {
      const operations = yield* buildOperations()
      const first = yield* runReady(operations)

      const secondError = yield* operations
        .run()
        .pipe(
          Effect.provideService(HttpServerFactoryService, inertHttpServerFactory("HTTP is outside this test")),
          Effect.flip
        )
      expect(secondError).toBeInstanceOf(McpServerError)
      expect(secondError.message).toBe("MCP server is already running")

      yield* operations.stop()
      yield* Fiber.join(first)
    })
  )

  it.effect("handles every stdio process shutdown signal through the shared coordinator", () =>
    Effect.gen(function* () {
      const reasons = ["stdin-eof", "stdin-close", "sigint", "sigterm"] as const
      for (const reason of reasons) {
        const stdioProcess = new TestStdioProcess()
        const operations = yield* buildOperations(stdioProcess)
        const fiber = yield* runReady(operations)
        stdioProcess.trigger(reason)
        if (reason === "stdin-eof" || reason === "stdin-close") {
          yield* Effect.yieldNow
          yield* TestClock.adjust("250 millis")
        }
        yield* Fiber.join(fiber)
      }
    })
  )

  it.effect("provides no-op defaults from the test layer", () =>
    Effect.gen(function* () {
      const context = yield* Layer.build(McpServerService.testLayer({}))
      const operations = Context.get(context, McpServerService)
      yield* operations
        .run()
        .pipe(
          Effect.provideService(HttpServerFactoryService, inertHttpServerFactory("test-layer default does not listen"))
        )
      yield* operations.stop()
      yield* operations.awaitReady()
    })
  )

  it.effect("uses configured client cleanup and the live stdio listener port", () =>
    Effect.gen(function* () {
      let closed = 0
      const operations = yield* buildOperations(
        new TestStdioProcess(),
        async () => {
          closed++
        },
        true
      )
      const fiber = yield* runReady(operations)
      yield* operations.stop()
      yield* Fiber.join(fiber)
      expect(closed).toBe(1)
    })
  )
})
