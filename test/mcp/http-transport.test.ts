import * as http from "node:http"

import { Context, Deferred, Effect, Fiber, Layer, Redacted, type Duration } from "effect"
import { HttpRouter, HttpServer, HttpServerResponse } from "effect/unstable/http"
import { describe, expect, it } from "vitest"

import {
  DEFAULT_HTTP_HOST,
  HttpHost,
  HttpPort,
  HttpServerFactoryService,
  HttpTransportError,
  httpServeError,
  startHttpTransport
} from "../../src/mcp/http-transport.js"
import type { HttpServerFactory } from "../../src/mcp/http-transport.js"
import { failingHttpServerFactory, makeTestHttpServerFactory } from "./http-test-support.js"

const routeLayer = HttpRouter.add("POST", "/mcp", HttpServerResponse.text("ok"))

interface RunningTransport {
  readonly server: http.Server
  readonly url: string
  readonly stop: () => Promise<void>
}

const start = async (options?: {
  readonly authToken?: string
  readonly host?: string
  readonly gracePeriod?: Duration.Input
  readonly onShutdown?: () => Effect.Effect<void>
  readonly writeError?: (message: string) => void
}): Promise<RunningTransport> => {
  const listening = await Effect.runPromise(Deferred.make<http.Server>())
  const ready = await Effect.runPromise(Deferred.make<void>())
  const shutdown = await Effect.runPromise(Deferred.make<void>())
  const factory = makeTestHttpServerFactory(
    (server) => Effect.runSync(Deferred.succeed(listening, server)),
    options?.writeError
  )
  const host = HttpHost.make(options?.host ?? DEFAULT_HTTP_HOST)
  const config = {
    host,
    port: HttpPort.make(0),
    ...(options?.authToken === undefined ? {} : { authToken: Redacted.make(options.authToken) }),
    ...(options?.gracePeriod === undefined ? {} : { shutdownGracePeriod: options.gracePeriod }),
    ...(options?.onShutdown === undefined ? {} : { onShutdown: options.onShutdown }),
    onReady: () => Deferred.succeed(ready, undefined).pipe(Effect.asVoid),
    shutdown: Deferred.await(shutdown)
  }
  const fiber = Effect.runFork(
    startHttpTransport(config, routeLayer).pipe(Effect.provideService(HttpServerFactoryService, factory))
  )
  const server = await Effect.runPromise(Deferred.await(listening))
  await Effect.runPromise(Deferred.await(ready))
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("Expected a TCP address")
  return {
    server,
    url: `http://127.0.0.1:${String(address.port)}/mcp`,
    stop: async () => {
      await Effect.runPromise(Deferred.succeed(shutdown, undefined))
      await Effect.runPromise(Fiber.join(fiber))
    }
  }
}

const post = (url: string, headers?: Record<string, string>): Promise<Response> =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: "{}" })

const postWithNodeHeaders = (url: string, headers: Record<string, string>): Promise<{ readonly status: number }> =>
  new Promise((resolve, reject) => {
    const target = new URL(url)
    const request = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: "POST",
        headers: { "content-type": "application/json", ...headers }
      },
      (response) => {
        response.resume()
        response.once("end", () => resolve({ status: response.statusCode ?? 0 }))
      }
    )
    request.once("error", reject)
    request.end("{}")
  })

const addressFactory = (address: HttpServer.Address): HttpServerFactory => ({
  make: () => Effect.succeed(HttpServer.make({ address, serve: () => Effect.void }))
})

describe("Effect HTTP transport policy", () => {
  it("builds the default Node factory with optional graceful timeout", async () => {
    const addresses = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* Layer.build(HttpServerFactoryService.defaultLayer)
          const factory = Context.get(context, HttpServerFactoryService)
          const server = yield* factory.make(HttpPort.make(0), DEFAULT_HTTP_HOST)
          const boundedServer = yield* factory.make(HttpPort.make(0), DEFAULT_HTTP_HOST, "1 second")
          return [server.address, boundedServer.address]
        })
      )
    )
    expect(addresses.map((address) => address._tag)).toEqual(["TcpAddress", "TcpAddress"])
  })

  it("returns a JSON-RPC unauthorized response and does not run the route", async () => {
    const transport = await start({ authToken: "secret" })
    try {
      const response = await post(transport.url)
      expect(response.status).toBe(401)
      expect(response.headers.get("www-authenticate")).toBe("Bearer")
      expect(await response.json()).toEqual({
        jsonrpc: "2.0",
        error: { code: -32_000, message: "Unauthorized" },
        id: null
      })
    } finally {
      await transport.stop()
    }
  })

  it("accepts bearer auth and local browser origins", async () => {
    const transport = await start({ authToken: "secret" })
    try {
      const response = await post(transport.url, { authorization: "Bearer secret", origin: "http://localhost:4321" })
      expect(response.status).toBe(200)
      expect(await response.text()).toBe("ok")
    } finally {
      await transport.stop()
    }
  })

  it("rejects malformed origins and every malformed bearer shape", async () => {
    const transport = await start({ authToken: "secret" })
    try {
      expect((await post(transport.url, { authorization: "Bearer secret", origin: "not a url" })).status).toBe(403)
      expect((await post(transport.url, { authorization: "Basic secret" })).status).toBe(401)
      expect((await post(transport.url, { authorization: "Bearer short" })).status).toBe(401)
      expect((await post(transport.url, { authorization: "Bearer secred" })).status).toBe(401)
    } finally {
      await transport.stop()
    }
  })

  it("treats an empty configured token as disabled and permits host headers for a non-local binding", async () => {
    const emptyTokenTransport = await start({ authToken: "   " })
    try {
      expect((await post(emptyTokenTransport.url)).status).toBe(200)
    } finally {
      await emptyTokenTransport.stop()
    }

    const externalPolicyTransport = await start({ host: "0.0.0.0" })
    try {
      expect((await postWithNodeHeaders(externalPolicyTransport.url, { host: "external.example" })).status).toBe(200)
    } finally {
      await externalPolicyTransport.stop()
    }
  })

  it("rejects non-local Host and Origin headers for a local binding", async () => {
    const transport = await start()
    try {
      const hostResponse = await postWithNodeHeaders(transport.url, { host: "evil.example" })
      expect(hostResponse.status).toBe(403)
      const originResponse = await postWithNodeHeaders(transport.url, { origin: "https://evil.example" })
      expect(originResponse.status).toBe(403)
      const ipv6Host = await postWithNodeHeaders(transport.url, { host: "[::1]:4321" })
      expect(ipv6Host.status).toBe(200)
      const malformedIpv6Host = await postWithNodeHeaders(transport.url, { host: "[" })
      expect(malformedIpv6Host.status).toBe(403)
    } finally {
      await transport.stop()
    }
  })

  it("closes the listener when the owner completes shutdown", async () => {
    const transport = await start()
    await transport.stop()
    expect(transport.server.listening).toBe(false)
  })

  it("supports omitted readiness and shutdown callbacks until the owner interrupts", async () => {
    const listening = await Effect.runPromise(Deferred.make<http.Server>())
    const factory = makeTestHttpServerFactory((server) => Effect.runSync(Deferred.succeed(listening, server)))
    const fiber = Effect.runFork(
      startHttpTransport({ host: DEFAULT_HTTP_HOST, port: HttpPort.make(0) }, routeLayer).pipe(
        Effect.provideService(HttpServerFactoryService, factory)
      )
    )
    const server = await Effect.runPromise(Deferred.await(listening))

    expect(server.listening).toBe(true)
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(server.listening).toBe(false)
  })

  it("reports Unix-socket and IPv6 listener addresses", async () => {
    const diagnostics: Array<string> = []
    for (const address of [
      { _tag: "UnixAddress", path: "/tmp/huly-mcp-test.sock" },
      { _tag: "TcpAddress", hostname: "::1", port: 4321 }
    ] satisfies ReadonlyArray<HttpServer.Address>) {
      await Effect.runPromise(
        startHttpTransport(
          { host: DEFAULT_HTTP_HOST, port: HttpPort.make(0), shutdown: Effect.void },
          routeLayer,
          (message) => diagnostics.push(message)
        ).pipe(Effect.provideService(HttpServerFactoryService, addressFactory(address)))
      )
    }

    expect(diagnostics).toEqual([
      "MCP HTTP server listening on /tmp/huly-mcp-test.sock\n",
      "MCP HTTP server listening on http://[::1]:4321/mcp\n"
    ])
  })

  it("closes the listener after a bounded drain timeout", async () => {
    const diagnostics: Array<string> = []
    const transport = await start({
      gracePeriod: "20 millis",
      onShutdown: () => Effect.never,
      writeError: (message) => diagnostics.push(message)
    })
    await transport.stop()
    expect(transport.server.listening).toBe(false)
    expect(diagnostics).toContain("MCP HTTP server drain timed out\n")
  })

  it("reports drain defects while still closing the listener", async () => {
    for (const failure of [new Error("error drain"), "string drain"]) {
      const diagnostics: Array<string> = []
      const transport = await start({
        onShutdown: () => Effect.die(failure),
        writeError: (message) => diagnostics.push(message)
      })
      await transport.stop()
      expect(transport.server.listening).toBe(false)
      expect(diagnostics.join("\n")).toContain(typeof failure === "string" ? failure : failure.message)
    }
  })

  it("formats typed listener failures with their host and port", () => {
    const error = httpServeError(DEFAULT_HTTP_HOST, HttpPort.make(4321), { cause: "address in use" })
    expect(error).toBeInstanceOf(HttpTransportError)
    expect(error.message).toContain("127.0.0.1:4321")
  })

  it("preserves typed listener startup failures", async () => {
    const factory = failingHttpServerFactory(new HttpTransportError({ message: "startup-failed" }))
    const result = await Effect.runPromiseExit(
      startHttpTransport({ host: DEFAULT_HTTP_HOST, port: HttpPort.make(0) }, routeLayer).pipe(
        Effect.provideService(HttpServerFactoryService, factory)
      )
    )
    expect(result._tag).toBe("Failure")
  })
})
