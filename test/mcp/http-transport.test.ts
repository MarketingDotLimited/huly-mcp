import http from "node:http"

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { Server } from "@modelcontextprotocol/server"
import { Context, Effect, Exit, Fiber, Layer, Schema, Scope } from "effect"
import { afterEach, describe, expect, it } from "vitest"

import { createMcpServer } from "../../src/mcp/create-mcp-server.js"
import { HttpServerFactoryService, HttpTransportError, startHttpTransport } from "../../src/mcp/http-transport.js"
import { PROXY_TOOL_NAMES } from "../../src/mcp/proxy-tools.js"
import { toolRegistry } from "../../src/mcp/tools/index.js"
import type { TelemetryOperations } from "../../src/telemetry/telemetry.js"
import { failingHttpServerFactory, listenTestMcpHttpServer, makeTestHttpServerFactory } from "./http-test-support.js"

const protocolVersion = "2026-07-28"
const legacyProtocolVersion = "2025-06-18"
const AnyRecordSchema = Schema.Record({ key: Schema.String, value: Schema.Unknown })
const JsonRpcResponseSchema = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.NullOr(Schema.Union(Schema.String, Schema.Number)),
  result: Schema.optionalWith(AnyRecordSchema, { exact: true }),
  error: Schema.optionalWith(
    Schema.Struct({
      code: Schema.Number,
      message: Schema.String,
      data: Schema.optionalWith(Schema.Unknown, { exact: true })
    }),
    { exact: true }
  )
})

const parseResponse = async (response: Response): Promise<Schema.Schema.Type<typeof JsonRpcResponseSchema>> => {
  const body = await response.text()
  const json =
    response.headers.get("content-type")?.includes("text/event-stream") === true
      ? body
          .split("\n")
          .find((line) => line.startsWith("data: "))
          ?.slice("data: ".length)
      : body
  if (json === undefined) throw new Error("Expected an SSE data event")
  return Schema.decodeUnknownSync(JsonRpcResponseSchema)(JSON.parse(json))
}

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const createTestServer = (): Server => {
  const server = new Server(
    { name: "huly-mcp-test", version: "1.0.0" },
    { capabilities: { resources: {}, tools: {} }, instructions: "final protocol with legacy compatibility" }
  )
  server.setRequestHandler("tools/list", async () => ({
    tools: [{ name: "hello", description: "Return a greeting.", inputSchema: { type: "object" } }]
  }))
  server.setRequestHandler("tools/call", async () => ({ content: [{ type: "text", text: "hello" }] }))
  server.setRequestHandler("resources/list", async () => ({ resources: [] }))
  server.setRequestHandler("resources/templates/list", async () => ({ resourceTemplates: [] }))
  server.setRequestHandler("resources/read", async () => ({ contents: [] }))
  return server
}

const telemetry: TelemetryOperations = {
  sessionStart: () => {},
  firstListTools: () => {},
  toolCalled: () => {},
  shutdown: async () => {}
}

const createCallerAwareServer = (): Server => {
  const [server] = createMcpServer(
    () => Promise.reject(new Error("Tool listing must not resolve Huly clients")),
    telemetry,
    toolRegistry,
    () => {
      throw new Error("Tool listing must not build Huly context")
    },
    undefined,
    { exposureConfig: { configuredMode: "auto", proxyOutputStrict: false } }
  )
  return server
}

const modernBody = (
  method: string,
  params: Record<string, unknown>,
  includeClientInfo: boolean = true,
  protocolVersionClaim: string = protocolVersion
): Record<string, unknown> => ({
  jsonrpc: "2.0",
  id: 1,
  method,
  params: {
    ...params,
    _meta: {
      "io.modelcontextprotocol/protocolVersion": protocolVersionClaim,
      "io.modelcontextprotocol/clientCapabilities": {},
      ...(includeClientInfo
        ? { "io.modelcontextprotocol/clientInfo": { name: "transport-test", version: "1.0.0" } }
        : {})
    }
  }
})

const modernHeaders = (method: string, name?: string): Record<string, string> => ({
  accept: "application/json, text/event-stream",
  "content-type": "application/json",
  "mcp-protocol-version": protocolVersion,
  "mcp-method": method,
  ...(name === undefined ? {} : { "mcp-name": name })
})

const startedServers = new Set<http.Server>()

const deferred = <A>(): {
  readonly promise: Promise<A>
  readonly resolve: (value: A) => void
  readonly reject: (reason?: unknown) => void
} => {
  let resolve!: (value: A) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<A>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const listen = async (
  authToken?: string,
  writeError: (message: string) => void = () => {},
  createServer: () => Server = createTestServer
): Promise<{ readonly baseUrl: string; readonly close: () => Promise<void> }> => {
  const endpoint = await listenTestMcpHttpServer(createServer, authToken, writeError)
  startedServers.add(endpoint.server)
  return {
    baseUrl: endpoint.baseUrl,
    close: async () => {
      await endpoint.close()
      startedServers.delete(endpoint.server)
    }
  }
}

const postWithHostHeader = (endpoint: string, hostHeader: string): Promise<number | undefined> => {
  const url = new URL(endpoint)
  const body = JSON.stringify(modernBody("server/discover", {}))
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: { ...modernHeaders("server/discover"), host: hostHeader, "content-length": Buffer.byteLength(body) }
      },
      (response) => {
        response.resume()
        response.on("end", () => resolve(response.statusCode))
      }
    )
    request.on("error", reject)
    request.end(body)
  })
}

afterEach(async () => {
  await Promise.all(
    [...startedServers].map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve())
        })
    )
  )
  startedServers.clear()
})

describe("MCP 2026-07-28 HTTP transport with 2025 compatibility", () => {
  it("connects with the released SDK client pinned to the final protocol", async () => {
    const endpoint = await listen()
    const client = new Client(
      { name: "released-http-client", version: "1.0.0" },
      { versionNegotiation: { mode: { pin: protocolVersion } } }
    )

    await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.baseUrl)))
    const result = await client.listTools()

    expect(result.tools.map((tool) => tool.name)).toContain("hello")
    await client.close()
    await endpoint.close()
  })

  it("uses final clientInfo for caller-aware tool exposure", async () => {
    const endpoint = await listen(undefined, () => {}, createCallerAwareServer)
    const client = new Client(
      { name: "claude-ai", version: "1.0.0" },
      { versionNegotiation: { mode: { pin: protocolVersion } } }
    )

    await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.baseUrl)))
    const result = await client.listTools()
    const names = result.tools.map((tool) => tool.name)

    expect(names).toEqual(expect.arrayContaining([...PROXY_TOOL_NAMES]))
    expect(names).not.toContain("list_projects")
    await client.close()
    await endpoint.close()
  })

  it("discovers the final protocol without clientInfo and stamps final response metadata", async () => {
    const endpoint = await listen()
    const response = await fetch(endpoint.baseUrl, {
      method: "POST",
      headers: modernHeaders("server/discover"),
      body: JSON.stringify(modernBody("server/discover", {}, false))
    })
    const body = await parseResponse(response)

    expect(response.status).toBe(200)
    expect(body.result).toMatchObject({
      supportedVersions: [protocolVersion],
      capabilities: { tools: {}, resources: {} },
      instructions: "final protocol with legacy compatibility",
      resultType: "complete",
      ttlMs: 0,
      cacheScope: "private",
      _meta: { "io.modelcontextprotocol/serverInfo": { name: "huly-mcp-test", version: "1.0.0" } }
    })
    await endpoint.close()
  })

  it("serves the 2025-06-18 initialize handshake", async () => {
    const endpoint = await listen()
    const response = await fetch(endpoint.baseUrl, {
      method: "POST",
      headers: { accept: "application/json, text/event-stream", "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: legacyProtocolVersion,
          capabilities: {},
          clientInfo: { name: "legacy-http-client", version: "1" }
        }
      })
    })
    const body = await parseResponse(response)

    expect(response.status).toBe(200)
    expect(body.result).toMatchObject({
      protocolVersion: legacyProtocolVersion,
      capabilities: { tools: {}, resources: {} },
      serverInfo: { name: "huly-mcp-test", version: "1.0.0" }
    })
    await endpoint.close()
  })

  it("connects a released legacy HTTP client and lists tools", async () => {
    const endpoint = await listen()
    const client = new Client(
      { name: "legacy-http-client", version: "1.0.0" },
      { versionNegotiation: { mode: "legacy" } }
    )

    await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.baseUrl)))
    const result = await client.listTools()

    expect(result.tools.map((tool) => tool.name)).toContain("hello")
    await client.close()
    await endpoint.close()
  })

  it("waits for asynchronous legacy server cleanup during mounted-handler shutdown", async () => {
    const release = deferred<void>()
    const closeStarted = deferred<void>()
    const endpoint = await listen(
      undefined,
      () => {},
      () => {
        const server = createTestServer()
        const originalClose = server.close.bind(server)
        server.close = async () => {
          closeStarted.resolve()
          await release.promise
          await originalClose()
        }
        return server
      }
    )
    const response = await fetch(endpoint.baseUrl, {
      method: "POST",
      headers: { accept: "application/json, text/event-stream", "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: legacyProtocolVersion,
          capabilities: {},
          clientInfo: { name: "legacy-http-client", version: "1" }
        }
      })
    })
    await parseResponse(response)
    await closeStarted.promise

    let settled = false
    const closing = endpoint.close().then(() => {
      settled = true
    })
    await Promise.resolve()

    expect(settled).toBe(false)
    release.resolve()
    await closing
    expect(settled).toBe(true)
  })

  it("surfaces rejected legacy server cleanup during mounted-handler shutdown", async () => {
    const closeStarted = deferred<void>()
    const endpoint = await listen(
      undefined,
      () => {},
      () => {
        const server = createTestServer()
        server.close = () => {
          closeStarted.resolve()
          return Promise.reject(new Error("legacy cleanup failed"))
        }
        return server
      }
    )
    const response = await fetch(endpoint.baseUrl, {
      method: "POST",
      headers: { accept: "application/json, text/event-stream", "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: legacyProtocolVersion,
          capabilities: {},
          clientInfo: { name: "legacy-http-client", version: "1" }
        }
      })
    })
    await parseResponse(response)
    await closeStarted.promise

    await expect(endpoint.close()).rejects.toThrow("legacy cleanup failed")
  })

  it("keeps repeated legacy product close idempotent", async () => {
    let product: Server | undefined
    const endpoint = await listen(
      undefined,
      () => {},
      () => {
        product = createTestServer()
        return product
      }
    )
    const response = await fetch(endpoint.baseUrl, {
      method: "POST",
      headers: { accept: "application/json, text/event-stream", "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: legacyProtocolVersion,
          capabilities: {},
          clientInfo: { name: "legacy-http-client", version: "1" }
        }
      })
    })
    await parseResponse(response)
    if (product === undefined) throw new Error("Expected a legacy server product")

    await product.close()
    await endpoint.close()
  })

  it("aggregates multiple rejected legacy server cleanups", async () => {
    let productCount = 0
    const endpoint = await listen(
      undefined,
      () => {},
      () => {
        const server = createTestServer()
        productCount++
        const productNumber = productCount
        server.close = () => Promise.reject(new Error(`legacy cleanup ${productNumber} failed`))
        return server
      }
    )
    const request = {
      method: "POST",
      headers: { accept: "application/json, text/event-stream", "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: legacyProtocolVersion,
          capabilities: {},
          clientInfo: { name: "legacy-http-client", version: "1" }
        }
      })
    } satisfies RequestInit

    await parseResponse(await fetch(endpoint.baseUrl, request))
    await parseResponse(await fetch(endpoint.baseUrl, request))
    const failure = await endpoint.close().catch((error: unknown) => error)
    if (!(failure instanceof AggregateError)) throw new Error("Expected an AggregateError")

    expect(failure.errors).toEqual([
      expect.objectContaining({ message: "legacy cleanup 1 failed" }),
      expect.objectContaining({ message: "legacy cleanup 2 failed" })
    ])
  })

  it("uses the final header-mismatch code for malformed modern requests", async () => {
    const endpoint = await listen()
    const headers = modernHeaders("tools/list")
    delete headers["mcp-method"]
    const response = await fetch(endpoint.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(modernBody("tools/list", {}))
    })
    const body = await parseResponse(response)

    expect(response.status).toBe(400)
    expect(body.error?.code).toBe(-32020)
    await endpoint.close()
  })

  it.each([
    { name: "mismatched method", headers: modernHeaders("resources/list"), body: modernBody("tools/list", {}) },
    {
      name: "missing tool name",
      headers: modernHeaders("tools/call"),
      body: modernBody("tools/call", { name: "hello", arguments: {} })
    },
    {
      name: "mismatched tool name",
      headers: modernHeaders("tools/call", "different"),
      body: modernBody("tools/call", { name: "hello", arguments: {} })
    },
    {
      name: "mismatched protocol version",
      headers: { ...modernHeaders("tools/list"), "mcp-protocol-version": "2099-01-01" },
      body: modernBody("tools/list", {})
    },
    {
      name: "missing resource name",
      headers: modernHeaders("resources/read"),
      body: modernBody("resources/read", { uri: "test://resource" })
    },
    {
      name: "mismatched resource name",
      headers: modernHeaders("resources/read", "test://different"),
      body: modernBody("resources/read", { uri: "test://resource" })
    }
  ])("rejects $name headers with the final mismatch error", async ({ body, headers }) => {
    const endpoint = await listen()
    const response = await fetch(endpoint.baseUrl, { method: "POST", headers, body: JSON.stringify(body) })
    const parsed = await parseResponse(response)

    expect(response.status).toBe(400)
    expect(parsed.error?.code).toBe(-32020)
    await endpoint.close()
  })

  it("uses the unsupported-version error when header and envelope agree on an unsupported revision", async () => {
    const endpoint = await listen()
    const response = await fetch(endpoint.baseUrl, {
      method: "POST",
      headers: { ...modernHeaders("tools/list"), "mcp-protocol-version": "2099-01-01" },
      body: JSON.stringify(modernBody("tools/list", {}, true, "2099-01-01"))
    })
    const body = await parseResponse(response)

    expect(response.status).toBe(400)
    expect(body.error?.code).toBe(-32022)
    await endpoint.close()
  })

  it.each([
    {
      cacheable: false,
      method: "tools/call",
      name: "hello",
      params: { name: "hello", arguments: {} },
      expected: { content: [{ type: "text", text: "hello" }] }
    },
    { cacheable: true, method: "resources/list", params: {}, expected: { resources: [] } },
    { cacheable: true, method: "resources/templates/list", params: {}, expected: { resourceTemplates: [] } },
    {
      cacheable: true,
      method: "resources/read",
      name: "test://resource",
      params: { uri: "test://resource" },
      expected: { contents: [] }
    }
  ])("serves final wire metadata for $method", async ({ cacheable, expected, method, name, params }) => {
    const endpoint = await listen()
    const response = await fetch(endpoint.baseUrl, {
      method: "POST",
      headers: modernHeaders(method, name),
      body: JSON.stringify(modernBody(method, params))
    })
    const body = await parseResponse(response)

    expect(response.status).toBe(200)
    expect(body.result).toMatchObject({
      ...expected,
      resultType: "complete",
      ...(cacheable ? { ttlMs: 0, cacheScope: "private" } : {}),
      _meta: { "io.modelcontextprotocol/serverInfo": { name: "huly-mcp-test", version: "1.0.0" } }
    })
    await endpoint.close()
  })

  it("rejects malformed supplied clientInfo", async () => {
    const endpoint = await listen()
    const body = modernBody("tools/list", {})
    const params = body.params
    if (!isJsonObject(params)) throw new Error("Expected request params")
    const meta = params._meta
    if (!isJsonObject(meta)) throw new Error("Expected request metadata")
    meta["io.modelcontextprotocol/clientInfo"] = { name: 42, version: "1.0.0" }

    const response = await fetch(endpoint.baseUrl, {
      method: "POST",
      headers: modernHeaders("tools/list"),
      body: JSON.stringify(body)
    })
    const parsed = await parseResponse(response)

    expect(response.status).toBe(400)
    expect(parsed.error?.code).toBe(-32602)
    await endpoint.close()
  })

  it("retains the SDK app's Origin protection", async () => {
    const endpoint = await listen()
    const response = await fetch(endpoint.baseUrl, {
      method: "POST",
      headers: { ...modernHeaders("server/discover"), origin: "https://attacker.example" },
      body: JSON.stringify(modernBody("server/discover", {}))
    })

    expect(response.status).toBe(403)
    await endpoint.close()
  })

  it("retains the SDK app's Host protection", async () => {
    const endpoint = await listen()

    expect(await postWithHostHeader(endpoint.baseUrl, "attacker.example")).toBe(403)
    await endpoint.close()
  })

  it("serves tools through final headers and SDK-owned result fields", async () => {
    const endpoint = await listen()
    const response = await fetch(endpoint.baseUrl, {
      method: "POST",
      headers: modernHeaders("tools/list"),
      body: JSON.stringify(modernBody("tools/list", {}))
    })
    const body = await parseResponse(response)

    expect(response.status).toBe(200)
    expect(body.result).toMatchObject({
      tools: [{ name: "hello" }],
      resultType: "complete",
      ttlMs: 0,
      cacheScope: "private"
    })
    await endpoint.close()
  })

  it("enforces the fixed bearer token before constructing an MCP server", async () => {
    let errors = ""
    const endpoint = await listen("secret", (message) => {
      errors += message
    })
    const request: RequestInit = {
      method: "POST",
      headers: modernHeaders("server/discover"),
      body: JSON.stringify(modernBody("server/discover", {}))
    }

    const unauthorized = await fetch(endpoint.baseUrl, request)
    const authorized = await fetch(endpoint.baseUrl, {
      ...request,
      headers: { ...modernHeaders("server/discover"), authorization: "Bearer secret" }
    })

    expect(unauthorized.status).toBe(401)
    expect(unauthorized.headers.get("www-authenticate")).toBe("Bearer")
    expect(authorized.status).toBe(200)
    expect(errors).toBe("")
    await endpoint.close()
  })

  it("reports factory failures without leaking exception details into the response", async () => {
    const errors: Array<string> = []
    const endpoint = await listenTestMcpHttpServer(
      () => {
        throw new Error("factory exploded")
      },
      undefined,
      (message) => errors.push(message)
    )
    startedServers.add(endpoint.server)

    const response = await fetch(endpoint.baseUrl, {
      method: "POST",
      headers: modernHeaders("server/discover"),
      body: JSON.stringify(modernBody("server/discover", {}))
    })
    const body = await parseResponse(response)

    expect(response.status).toBe(500)
    expect(body.error).toMatchObject({ code: -32603, message: "Internal server error" })
    expect(JSON.stringify(body)).not.toContain("factory exploded")
    expect(errors.join("")).toContain("factory exploded")
    await endpoint.close()
    startedServers.delete(endpoint.server)
  })
})

describe("HTTP transport Effect lifecycle", () => {
  it("closes the listening server and SDK handler after SIGTERM", { timeout: 5000 }, async () => {
    const listening = deferred<http.Server>()
    const signalHandlersReady = deferred<void>()
    const writes: Array<string> = []
    const factory = makeTestHttpServerFactory(
      (server) => {
        startedServers.add(server)
        listening.resolve(server)
      },
      (message) => {
        writes.push(message)
        if (message.includes("MCP HTTP server listening")) signalHandlersReady.resolve()
      }
    )

    const fiber = Effect.runFork(
      startHttpTransport({ port: 0, host: "127.0.0.1" }, createTestServer).pipe(
        Effect.scoped,
        Effect.provideService(HttpServerFactoryService, factory)
      )
    )
    const server = await listening.promise
    await signalHandlersReady.promise
    expect(server.listening).toBe(true)
    process.emit("SIGTERM")
    await Effect.runPromise(Fiber.join(fiber))

    expect(server.listening).toBe(false)
    expect(writes.join("")).toContain("MCP HTTP server listening")
    startedServers.delete(server)
  })

  it("surfaces listener startup failures as typed transport errors", async () => {
    const expected = new HttpTransportError({ message: "port unavailable" })
    const factory = failingHttpServerFactory(expected)

    const result = await Effect.runPromise(
      Effect.exit(
        startHttpTransport({ port: 1, host: "127.0.0.1" }, createTestServer).pipe(
          Effect.scoped,
          Effect.provideService(HttpServerFactoryService, factory)
        )
      )
    )

    expect(result._tag).toBe("Failure")
    expect(String(result)).toContain("port unavailable")
  })

  it("provides a working default Effect listener and reports occupied ports", async () => {
    const context = await Effect.runPromise(Layer.build(HttpServerFactoryService.defaultLayer).pipe(Effect.scoped))
    const factory = Context.get(context, HttpServerFactoryService)
    const scope = await Effect.runPromise(Scope.make())
    const server = await Effect.runPromise(factory.make(0, "127.0.0.1").pipe(Scope.extend(scope)))
    factory.writeError?.("")
    if (server.address._tag !== "TcpAddress") throw new Error("Expected an assigned TCP port")

    const occupied = await Effect.runPromise(
      Effect.exit(factory.make(server.address.port, "127.0.0.1").pipe(Effect.scoped))
    )

    expect(occupied._tag).toBe("Failure")
    expect(String(occupied)).toContain("Failed to start HTTP server")
    await Effect.runPromise(Scope.close(scope, Exit.void))
  })

  it("supports an injected Effect HTTP server", async () => {
    const writes: Array<string> = []
    const ready = deferred<void>()
    const factory = makeTestHttpServerFactory(
      () => {},
      (message) => {
        writes.push(message)
        if (message.includes("MCP HTTP server listening")) ready.resolve()
      }
    )
    const fiber = Effect.runFork(
      startHttpTransport({ port: 1, host: "127.0.0.1" }, createTestServer).pipe(
        Effect.scoped,
        Effect.provideService(HttpServerFactoryService, factory)
      )
    )
    await ready.promise

    process.emit("SIGTERM")
    await Effect.runPromise(Fiber.join(fiber))

    expect(writes.join("")).toContain("MCP HTTP server listening")
  })
})
