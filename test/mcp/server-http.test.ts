import type http from "node:http"

import { Context, Effect, Exit, Fiber, Layer, Redacted, Schema } from "effect"
import { describe, expect, it } from "vitest"

import { sanitizeHulyRuntimeConfigFromEnv } from "../../src/config/config.js"
import { HulyClient } from "../../src/huly/client.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import { HttpServerFactoryService } from "../../src/mcp/http-transport.js"
import type { ClientBundle } from "../../src/mcp/server.js"
import { McpServerService } from "../../src/mcp/server.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"
import { makeTestHttpServerFactory } from "./http-test-support.js"

const runtimeEnv = {
  HULY_URL: "https://huly.example.com",
  HULY_WORKSPACE: "workspace",
  HULY_TOKEN: "test-token"
}

const deferred = <A>(): { readonly promise: Promise<A>; readonly resolve: (value: A) => void } => {
  let resolvePromise: ((value: A) => void) | undefined
  const promise = new Promise<A>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: (value) => resolvePromise?.(value) }
}

const clientBundle = async (): Promise<ClientBundle> => {
  const layer = Layer.mergeAll(
    HulyClient.testLayer({}),
    HulyStorageClient.testLayer({}),
    WorkspaceClient.testLayer({})
  )
  const context = await Effect.runPromise(Layer.build(layer).pipe(Effect.scoped))
  return {
    hulyClient: Context.get(context, HulyClient),
    storageClient: Context.get(context, HulyStorageClient),
    workspaceClient: Context.get(context, WorkspaceClient)
  }
}

const initializeRequest = (authorization?: string): RequestInit => ({
  method: "POST",
  headers: {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    ...(authorization === undefined ? {} : { authorization })
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "server-http-test", version: "1.0.0" }
    }
  })
})

const InitializeResponse = Schema.Struct({
  result: Schema.Struct({
    protocolVersion: Schema.String
  })
})

const buildServer = async (options: {
  readonly listening: ReturnType<typeof deferred<http.Server>>
  readonly resolveClients: () => Promise<Exit.Exit<ClientBundle>>
  readonly authToken?: string
}) => {
  const layer = McpServerService.layer({
    transport: "http",
    httpPort: 0,
    httpHost: "127.0.0.1",
    resolveClients: options.resolveClients,
    ...(options.authToken === undefined ? {} : { mcpAuthToken: Redacted.make(options.authToken) }),
    getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv)
  }).pipe(Layer.provide(TelemetryService.testLayer()))
  const context = await Effect.runPromise(Layer.build(layer).pipe(Effect.scoped))
  const operations = Context.get(context, McpServerService)
  const writes: Array<string> = []
  const factory = makeTestHttpServerFactory(options.listening.resolve, (message) => writes.push(message))
  const fiber = Effect.runFork(
    operations.run().pipe(Effect.provideService(HttpServerFactoryService, factory))
  )
  await Effect.runPromise(operations.awaitReady())
  return { fiber, operations, writes }
}

describe("McpServerService Effect HTTP lifecycle", () => {
  it("keeps HTTP running when stdin emits EOF", async () => {
    const listening = deferred<http.Server>()
    const bundle = await clientBundle()
    const server = await buildServer({
      listening,
      resolveClients: async () => Exit.succeed(bundle)
    })
    const rawServer = await listening.promise

    process.stdin.emit("end")
    await Promise.resolve()
    expect(rawServer.listening).toBe(true)

    await Effect.runPromise(server.operations.stop())
    await Effect.runPromise(Fiber.join(server.fiber))
    expect(rawServer.listening).toBe(false)
  })

  it("serves native initialize over HTTP and shuts down through the owner", async () => {
    const listening = deferred<http.Server>()
    const bundle = await clientBundle()
    const server = await buildServer({
      listening,
      resolveClients: async () => Exit.succeed(bundle),
      authToken: "server-secret"
    })
    const rawServer = await listening.promise
    const address = rawServer.address()
    if (address === null || typeof address === "string") throw new Error("Expected a TCP address")
    const endpoint = `http://127.0.0.1:${String(address.port)}/mcp`

    const unauthorized = await fetch(endpoint, initializeRequest())
    expect(unauthorized.status).toBe(401)
    const authorized = await fetch(endpoint, initializeRequest("Bearer server-secret"))
    expect(authorized.status).toBe(200)
    const response = Schema.decodeUnknownSync(InitializeResponse)(await authorized.json())
    expect(response.result.protocolVersion).toBe("2025-06-18")

    await Effect.runPromise(server.operations.stop())
    await Effect.runPromise(Fiber.join(server.fiber))
    expect(rawServer.listening).toBe(false)
  })
})
