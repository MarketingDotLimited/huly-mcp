import { PassThrough } from "node:stream"

import { createMcpExpressApp } from "@modelcontextprotocol/express"
import { Context, Effect, Fiber, Layer } from "effect"
import { describe, it } from "vitest"

import { sanitizeHulyRuntimeConfigFromEnv } from "../../src/config/config.js"
import { HulyClient } from "../../src/huly/client.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import { HttpServerFactoryService, HttpTransportError } from "../../src/mcp/http-transport.js"
import { createDefaultMcpSdkServer } from "../../src/mcp/sdk-server.js"
import type { ClientBundle } from "../../src/mcp/server.js"
import { McpServerService } from "../../src/mcp/server.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio"

const runtimeEnv = { HULY_URL: "https://huly.example.com", HULY_WORKSPACE: "workspace", HULY_TOKEN: "test-token" }

const clientBundle = async (): Promise<ClientBundle> => {
  const layer = Layer.mergeAll(HulyClient.testLayer({}), HulyStorageClient.testLayer({}), WorkspaceClient.testLayer({}))
  const context = await Effect.runPromise(Layer.build(layer).pipe(Effect.scoped))
  return {
    hulyClient: Context.get(context, HulyClient),
    storageClient: Context.get(context, HulyStorageClient),
    workspaceClient: Context.get(context, WorkspaceClient)
  }
}

const unusedHttpFactory: HttpServerFactoryService["Type"] = {
  createApp: (host) => createMcpExpressApp({ host }),
  listen: () => Effect.fail(new HttpTransportError({ message: "HTTP is outside this stdio test" }))
}

class FailingCloseTransport extends StdioServerTransport {
  override close(): Promise<void> {
    return Promise.reject(new Error("wire close failed"))
  }
}

describe("McpServerService released stdio lifecycle", () => {
  it("lets the SDK report owned stdio wire close failures out of band", async () => {
    const bundle = await clientBundle()
    const layer = McpServerService.layer({
      transport: "stdio",
      autoExit: true,
      resolveClients: async () => bundle,
      createServer: createDefaultMcpSdkServer,
      createStdioTransport: () => new FailingCloseTransport(new PassThrough(), new PassThrough()),
      getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv)
    }).pipe(Layer.provide(TelemetryService.testLayer()))
    const context = await Effect.runPromise(Layer.build(layer).pipe(Effect.scoped))
    const operations = Context.get(context, McpServerService)
    const fiber = Effect.runFork(
      operations.run().pipe(Effect.provideService(HttpServerFactoryService, unusedHttpFactory))
    )
    await Promise.resolve()

    await Effect.runPromise(operations.stop())
    await Effect.runPromise(Fiber.join(fiber))
  })

  it("closes the pinned modern server after draining on stdin end", async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const responseWritten = new Promise<void>((resolve) => {
      output.once("data", () => resolve())
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
    const bundle = await clientBundle()
    const layer = McpServerService.layer({
      transport: "stdio",
      autoExit: true,
      resolveClients: async () => bundle,
      createServer: createDefaultMcpSdkServer,
      createStdioTransport: () => new StdioServerTransport(input, output),
      getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv)
    }).pipe(Layer.provide(TelemetryService.testLayer()))
    const context = await Effect.runPromise(Layer.build(layer).pipe(Effect.scoped))
    const operations = Context.get(context, McpServerService)
    const fiber = Effect.runFork(
      operations.run().pipe(Effect.provideService(HttpServerFactoryService, unusedHttpFactory))
    )

    await responseWritten
    process.stdin.emit("end")
    await Effect.runPromise(Fiber.join(fiber))
  })
})
