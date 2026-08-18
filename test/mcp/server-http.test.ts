import type http from "node:http"

import { Context, Effect, Exit, Fiber, Layer, Redacted, Schema } from "effect"
import * as McpSchema from "effect/unstable/ai/McpSchema"
import { describe, expect, it } from "vitest"

import { sanitizeHulyRuntimeConfigFromEnv } from "../../src/config/config.js"
import { HulyClient } from "../../src/huly/client.js"
import { HulyConnectionError } from "../../src/huly/errors-base.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { WorkspaceClient, type WorkspaceClientOperations } from "../../src/huly/workspace-client.js"
import { HttpServerFactoryService } from "../../src/mcp/http-transport.js"
import type { RequestClientLease } from "../../src/mcp/request-client-lifecycle.js"
import type { ClientBundle } from "../../src/mcp/server.js"
import { McpServerService } from "../../src/mcp/server.js"
import type { HulyClientBundleError } from "../../src/runtime/client-resolver.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"
import { makeTestHttpServerFactory } from "./http-test-support.js"

const runtimeEnv = { HULY_URL: "https://huly.example.com", HULY_WORKSPACE: "workspace", HULY_TOKEN: "test-token" }
const McpProtocolVersionSchema = Schema.Literals(["2026-07-28", "2025-06-18"])
const ModernMethodSchema = Schema.Literals([
  "server/discover",
  "tools/list",
  "tools/call",
  "resources/templates/list",
  "resources/read"
])
type ModernMethod = Schema.Schema.Type<typeof ModernMethodSchema>
type ModernRequestId = Schema.Schema.Type<typeof Schema.Natural>
const McpRoutingNameSchema = Schema.NonEmptyString
type McpRoutingName = Schema.Schema.Type<typeof McpRoutingNameSchema>
const CacheTtlMillisecondsSchema = Schema.Natural.pipe(Schema.brand("CacheTtlMilliseconds"))
const JsonRpcErrorCodeSchema = Schema.Int.pipe(Schema.brand("JsonRpcErrorCode"))

const deferred = <A>(): { readonly promise: Promise<A>; readonly resolve: (value: A) => void } => {
  let resolvePromise: ((value: A) => void) | undefined
  const promise = new Promise<A>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: (value) => resolvePromise?.(value) }
}

const clientBundle = async (workspaceOperations: Partial<WorkspaceClientOperations> = {}): Promise<ClientBundle> => {
  const layer = Layer.mergeAll(
    HulyClient.testLayer({}),
    HulyStorageClient.testLayer({}),
    WorkspaceClient.testLayer(workspaceOperations)
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

const toolCallRequest = (authorization: string, sessionId: string): RequestInit => ({
  method: "POST",
  headers: {
    accept: "application/json, text/event-stream",
    authorization,
    "content-type": "application/json",
    "mcp-protocol-version": "2025-06-18",
    "mcp-session-id": sessionId
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "list_projects", arguments: {} }
  })
})

const modernRequest = (
  authorization: string,
  id: ModernRequestId,
  method: ModernMethod,
  params: Readonly<Record<string, unknown>> = {},
  name?: McpRoutingName,
  includeClientInfo = true,
  clientName = "server-http-test"
): RequestInit => ({
  method: "POST",
  headers: {
    accept: "application/json, text/event-stream",
    authorization,
    "content-type": "application/json",
    "mcp-protocol-version": "2026-07-28",
    "mcp-method": method,
    ...(name === undefined ? {} : { "mcp-name": name })
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id,
    method,
    params: {
      ...params,
      _meta: {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientCapabilities": {},
        ...(includeClientInfo ? { "io.modelcontextprotocol/clientInfo": { name: clientName, version: "1.0.0" } } : {})
      }
    }
  })
})

const discoverRequest = (authorization: string): RequestInit => modernRequest(authorization, 3, "server/discover")

const InitializeResponse = Schema.Struct({ result: Schema.Struct({ protocolVersion: McpProtocolVersionSchema }) })
const DiscoverResponse = Schema.Struct({
  result: Schema.Struct({
    supportedVersions: Schema.Array(McpProtocolVersionSchema),
    resultType: Schema.Literal("complete"),
    cacheScope: Schema.Literal("private"),
    _meta: Schema.Struct({
      "io.modelcontextprotocol/serverInfo": Schema.Struct({
        name: Schema.Literal("huly-mcp"),
        version: Schema.NonEmptyString
      })
    })
  })
})
const ModernToolsListResponse = Schema.Struct({
  result: Schema.Struct({
    tools: Schema.Array(Schema.Struct({ name: McpRoutingNameSchema })),
    resultType: Schema.Literal("complete"),
    ttlMs: CacheTtlMillisecondsSchema,
    cacheScope: Schema.Literal("private")
  })
})
const ModernToolCallResponse = Schema.Struct({
  result: Schema.Struct({
    content: Schema.Array(McpSchema.ContentBlock),
    resultType: Schema.Literal("complete"),
    isError: Schema.optionalKey(Schema.Boolean)
  })
})
const ModernResourceReadResponse = Schema.Union([
  Schema.Struct({
    result: Schema.Struct({
      contents: Schema.Array(Schema.Union([McpSchema.TextResourceContents, McpSchema.BlobResourceContents])),
      resultType: Schema.Literal("complete")
    })
  }),
  Schema.Struct({ error: Schema.Struct({ code: JsonRpcErrorCodeSchema, message: Schema.NonEmptyString }) })
])
const ModernResourceTemplatesResponse = Schema.Struct({
  result: Schema.Struct({
    resourceTemplates: Schema.Array(Schema.Struct({ uriTemplate: Schema.NonEmptyString })),
    resultType: Schema.Literal("complete"),
    ttlMs: CacheTtlMillisecondsSchema,
    cacheScope: Schema.Literal("private")
  })
})

const buildServer = async (options: {
  readonly listening: ReturnType<typeof deferred<http.Server>>
  readonly resolveClients: () => Promise<Exit.Exit<ClientBundle>>
  readonly authToken?: string
  readonly useDefaults?: boolean
  readonly requestRuntimeConfig?: boolean
  readonly runtimeConfigFallback?: boolean
  readonly resolveClientLeaseForHttpRequest?: (
    request: Request,
    signal: AbortSignal
  ) => Promise<RequestClientLease<Exit.Exit<ClientBundle, HulyClientBundleError>>>
}) => {
  const layer = McpServerService.layer({
    transport: "http",
    ...(options.useDefaults === true ? {} : { httpPort: 0, httpHost: "127.0.0.1" }),
    resolveClients: options.resolveClients,
    ...(options.resolveClientLeaseForHttpRequest === undefined
      ? {}
      : { resolveClientLeaseForHttpRequest: options.resolveClientLeaseForHttpRequest }),
    ...(options.authToken === undefined ? {} : { mcpAuthToken: Redacted.make(options.authToken) }),
    ...(options.runtimeConfigFallback === true
      ? {}
      : options.requestRuntimeConfig === true
        ? { getRuntimeConfigContextForHttpRequest: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv) }
        : { getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv) })
  }).pipe(Layer.provide(TelemetryService.testLayer()))
  const context = await Effect.runPromise(Layer.build(layer).pipe(Effect.scoped))
  const operations = Context.get(context, McpServerService)
  const writes: Array<string> = []
  const factory = makeTestHttpServerFactory(
    options.listening.resolve,
    (message) => writes.push(message),
    options.useDefaults === true ? 0 : undefined
  )
  const fiber = Effect.runFork(operations.run().pipe(Effect.provideService(HttpServerFactoryService, factory)))
  await Effect.runPromise(operations.awaitReady())
  return { fiber, operations, writes }
}

describe("McpServerService Effect HTTP lifecycle", () => {
  it("uses sanitized process configuration when no runtime callback is supplied", async () => {
    const listening = deferred<http.Server>()
    const bundle = await clientBundle()
    const server = await buildServer({
      listening,
      resolveClients: async () => Exit.succeed(bundle),
      runtimeConfigFallback: true
    })
    const rawServer = await listening.promise
    const address = rawServer.address()
    if (address === null || typeof address === "string") throw new Error("Expected a TCP address")
    const response = await fetch(`http://127.0.0.1:${String(address.port)}/mcp`, initializeRequest())
    expect(response.status).toBe(200)

    await Effect.runPromise(server.operations.stop())
    await Effect.runPromise(Fiber.join(server.fiber))
  })

  it("keeps HTTP running when stdin emits EOF", async () => {
    const listening = deferred<http.Server>()
    const bundle = await clientBundle()
    const server = await buildServer({
      listening,
      resolveClients: async () => Exit.succeed(bundle),
      useDefaults: true,
      requestRuntimeConfig: true
    })
    const rawServer = await listening.promise
    const address = rawServer.address()
    if (address === null || typeof address === "string") throw new Error("Expected a TCP address")
    const response = await fetch(`http://127.0.0.1:${String(address.port)}/mcp`, initializeRequest())
    expect(response.status).toBe(200)

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
    const sessionId = authorized.headers.get("mcp-session-id")
    if (sessionId === null) throw new Error("Expected initialize to return an MCP session id")
    const response = Schema.decodeUnknownSync(InitializeResponse)(await authorized.json())
    expect(response.result.protocolVersion).toBe("2025-06-18")
    const toolCall = await fetch(endpoint, toolCallRequest("Bearer server-secret", sessionId))
    expect(toolCall.status).toBe(200)
    expect(await toolCall.text()).toContain('"id":2')

    await Effect.runPromise(server.operations.stop())
    await Effect.runPromise(Fiber.join(server.fiber))
    expect(rawServer.listening).toBe(false)
  })

  it("serves stateless 2026 discovery without creating a session", async () => {
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

    const discovered = await fetch(endpoint, discoverRequest("Bearer server-secret"))
    expect(discovered.status).toBe(200)
    expect(discovered.headers.get("mcp-session-id")).toBeNull()
    const response = Schema.decodeUnknownSync(DiscoverResponse)(await discovered.json())
    expect(response.result.supportedVersions).toContain("2026-07-28")
    expect(response.result._meta["io.modelcontextprotocol/serverInfo"]).toEqual({
      name: "huly-mcp",
      version: expect.any(String)
    })

    const listed = await fetch(endpoint, modernRequest("Bearer server-secret", 4, "tools/list"))
    expect(listed.status).toBe(200)
    expect(listed.headers.get("mcp-session-id")).toBeNull()
    const tools = Schema.decodeUnknownSync(ModernToolsListResponse)(await listed.json())
    expect(tools.result.tools.map((tool) => tool.name)).toContain("get_version")
    expect(tools.result.ttlMs).toBeGreaterThanOrEqual(0)

    const called = await fetch(
      endpoint,
      modernRequest("Bearer server-secret", 5, "tools/call", { name: "get_version", arguments: {} }, "get_version")
    )
    expect(called.status).toBe(200)
    expect(called.headers.get("mcp-session-id")).toBeNull()
    const callResult = Schema.decodeUnknownSync(ModernToolCallResponse)(await called.json())
    expect(callResult.result.content.length).toBeGreaterThan(0)

    const templatesResponse = await fetch(
      endpoint,
      modernRequest("Bearer server-secret", 7, "resources/templates/list")
    )
    expect(templatesResponse.status).toBe(200)
    expect(templatesResponse.headers.get("mcp-session-id")).toBeNull()
    const templates = Schema.decodeUnknownSync(ModernResourceTemplatesResponse)(await templatesResponse.json())
    expect(templates.result.resourceTemplates.map((template) => template.uriTemplate)).toContain(
      "huly://projects/{project}"
    )
    expect(templates.result.ttlMs).toBeGreaterThanOrEqual(0)

    const read = await fetch(
      endpoint,
      modernRequest(
        "Bearer server-secret",
        8,
        "resources/read",
        { uri: "huly://projects/MISSING" },
        "huly://projects/MISSING"
      )
    )
    expect(read.status).toBe(200)
    expect(read.headers.get("mcp-session-id")).toBeNull()
    const readResult = Schema.decodeUnknownSync(ModernResourceReadResponse)(await read.json())
    expect("error" in readResult).toBe(true)

    const context = await fetch(
      endpoint,
      modernRequest(
        "Bearer server-secret",
        6,
        "tools/call",
        { name: "get_huly_context", arguments: {} },
        "get_huly_context",
        false
      )
    )
    expect(context.status).toBe(200)
    const contextResult = Schema.decodeUnknownSync(ModernToolCallResponse)(await context.json())
    expect(contextResult.result.content.length).toBeGreaterThan(0)

    await Effect.runPromise(server.operations.stop())
    await Effect.runPromise(Fiber.join(server.fiber))
  })

  it("isolates and releases modern HTTP client leases by request", async () => {
    const listening = deferred<http.Server>()
    const usedClients: Array<"workspace-a" | "workspace-b"> = []
    const workspaceA = await clientBundle({
      getUserProfile: () => {
        usedClients.push("workspace-a")
        return Effect.succeed(null)
      }
    })
    const workspaceB = await clientBundle({
      getUserProfile: () => {
        usedClients.push("workspace-b")
        return Effect.fail(new HulyConnectionError({ message: "workspace-b unavailable" }))
      }
    })
    const authorizations: Array<string | null> = []
    let closeCount = 0
    const server = await buildServer({
      listening,
      resolveClients: async () => Exit.succeed(workspaceA),
      resolveClientLeaseForHttpRequest: async (request) => {
        const authorization = request.headers.get("authorization")
        authorizations.push(authorization)
        return {
          bundle: Exit.succeed(authorization === "Bearer workspace-a" ? workspaceA : workspaceB),
          close: () => {
            closeCount += 1
          }
        }
      }
    })
    const rawServer = await listening.promise
    const address = rawServer.address()
    if (address === null || typeof address === "string") throw new Error("Expected a TCP address")
    const endpoint = `http://127.0.0.1:${String(address.port)}/mcp`

    const first = await fetch(
      endpoint,
      modernRequest(
        "Bearer workspace-a",
        9,
        "tools/call",
        { name: "get_user_profile", arguments: {} },
        "get_user_profile",
        true,
        "claude-code"
      )
    )
    const second = await fetch(
      endpoint,
      modernRequest(
        "Bearer workspace-b",
        10,
        "tools/call",
        { name: "get_user_profile", arguments: {} },
        "get_user_profile",
        true,
        "claude-code"
      )
    )
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    const firstResult = Schema.decodeUnknownSync(ModernToolCallResponse)(await first.json())
    const secondResult = Schema.decodeUnknownSync(ModernToolCallResponse)(await second.json())
    expect(firstResult.result.isError).not.toBe(true)
    expect(secondResult.result.isError).toBe(true)
    expect(usedClients).toEqual(["workspace-a", "workspace-b"])
    expect(authorizations).toEqual(["Bearer workspace-a", "Bearer workspace-b"])
    expect(closeCount).toBe(2)

    await Effect.runPromise(server.operations.stop())
    await Effect.runPromise(Fiber.join(server.fiber))
  })
})
