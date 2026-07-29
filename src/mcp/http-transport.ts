/**
 * MCP 2026-07-28 HTTP transport with SDK-owned 2025 compatibility.
 *
 * The official SDK owns the MCP wire boundary while Effect Platform owns the
 * HTTP routing, server lifecycle, and Node adapter.
 */
import { timingSafeEqual } from "node:crypto"
import { createServer as createNodeServer } from "node:http"

import { HttpApp, HttpRouter, type HttpServer, HttpServerError } from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  type McpServerFactory,
  originValidationResponse
} from "@modelcontextprotocol/server"
import type { Scope } from "effect"
import { Context, Effect, Layer, Schema } from "effect"

export const DEFAULT_HTTP_PORT = 3000
const HTTP_UNAUTHORIZED = 401

const writeStderr = (message: string): void => {
  process.stderr.write(message)
}

interface HttpTransportConfig {
  readonly port: number
  readonly host: string
  readonly authToken?: string | undefined
}

export class HttpTransportError extends Schema.TaggedError<HttpTransportError>()("HttpTransportError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect)
}) {}

export interface HttpServerFactory {
  readonly make: (port: number, host: string) => Effect.Effect<HttpServer.HttpServer, HttpTransportError, Scope.Scope>
  readonly writeError?: (message: string) => void
}

const defaultHttpServerFactory: HttpServerFactory = {
  make: (port, host) =>
    NodeHttpServer.make(createNodeServer, { port, host }).pipe(
      Effect.mapError(
        (error) =>
          new HttpTransportError({
            message: `Failed to start HTTP server on ${host}:${port}: ${String(error.cause)}`,
            cause: error
          })
      )
    ),
  writeError: writeStderr
}

export class HttpServerFactoryService extends Context.Tag("@hulymcp/HttpServerFactory")<
  HttpServerFactoryService,
  HttpServerFactory
>() {
  static readonly defaultLayer: Layer.Layer<HttpServerFactoryService> = Layer.succeed(
    HttpServerFactoryService,
    defaultHttpServerFactory
  )
}

const activeAuthToken = (authToken: string | undefined): string | undefined => {
  const trimmed = authToken?.trim()
  return trimmed === undefined || trimmed === "" ? undefined : trimmed
}

const extractBearerToken = (authorization: unknown): string | undefined => {
  if (typeof authorization !== "string") return undefined
  return /^Bearer ([^ ]+)$/iu.exec(authorization)?.[1]
}

const tokenMatches = (received: string, expected: string): boolean => {
  const receivedBuffer = Buffer.from(received, "utf8")
  const expectedBuffer = Buffer.from(expected, "utf8")
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer)
}

const isAuthorizedMcpRequest = (request: Request, authToken: string | undefined): boolean => {
  const expected = activeAuthToken(authToken)
  if (expected === undefined) return true
  const received = extractBearerToken(request.headers.get("authorization"))
  return received !== undefined && tokenMatches(received, expected)
}

const unauthorizedResponse = (): Response =>
  Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Unauthorized" }, id: null },
    { status: HTTP_UNAUTHORIZED, headers: { "WWW-Authenticate": "Bearer" } }
  )

export interface MountedMcpHttpHandler {
  readonly fetch: (request: Request) => Promise<Response>
  readonly close: () => Promise<void>
}

type McpServerProduct = Awaited<ReturnType<McpServerFactory>>

interface McpServerCloseTracker {
  readonly factory: McpServerFactory
  readonly drain: () => Promise<void>
}

const createMcpServerCloseTracker = (createServer: McpServerFactory): McpServerCloseTracker => {
  const pending = new Set<Promise<void>>()
  const failures: Array<unknown> = []
  const track = (server: McpServerProduct): McpServerProduct => {
    const originalClose = server.close.bind(server)
    let closePromise: Promise<void> | undefined
    server.close = () => {
      if (closePromise !== undefined) return closePromise
      const closing = originalClose()
      closePromise = closing
      pending.add(closing)
      void closing.then(
        () => pending.delete(closing),
        (error) => {
          pending.delete(closing)
          failures.push(error)
        }
      )
      return closing
    }
    return server
  }
  const drain = async (): Promise<void> => {
    while (pending.size > 0) await Promise.allSettled([...pending])
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, "One or more MCP server closes failed")
  }
  return { factory: async (context) => track(await createServer(context)), drain }
}

export const createMountedMcpHttpHandler = (
  createServer: McpServerFactory,
  authToken?: string,
  writeError: (message: string) => void = writeStderr,
  host: string = "127.0.0.1"
): MountedMcpHttpHandler => {
  const reportError = (error: Error): void => {
    writeError(`MCP HTTP handler error: ${error.message}\n`)
  }
  const closeTracker = createMcpServerCloseTracker(createServer)
  const activeRequests = new Set<Promise<Response>>()
  const mcpHandler = createMcpHandler(closeTracker.factory, { legacy: "stateless", onerror: reportError })
  const protectLocalhost = host === "127.0.0.1" || host === "localhost" || host === "::1"

  return {
    fetch: async (request) => {
      const rejected = protectLocalhost
        ? (hostHeaderValidationResponse(request, localhostAllowedHostnames()) ??
          originValidationResponse(request, localhostAllowedOrigins()))
        : undefined
      if (rejected !== undefined) return rejected
      if (!isAuthorizedMcpRequest(request, authToken)) return unauthorizedResponse()

      const response = mcpHandler.fetch(request)
      activeRequests.add(response)
      try {
        return await response
      } finally {
        activeRequests.delete(response)
      }
    },
    close: async () => {
      await mcpHandler.close()
      while (activeRequests.size > 0) await Promise.allSettled([...activeRequests])
      await closeTracker.drain()
    }
  }
}

export const createMcpHttpApp = (mounted: MountedMcpHttpHandler): HttpApp.Default<HttpServerError.HttpServerError> =>
  HttpRouter.empty.pipe(HttpRouter.all("/mcp", HttpApp.fromWebHandler(mounted.fetch)))

export const startHttpTransport = (
  config: HttpTransportConfig,
  createServer: McpServerFactory,
  configuredWriteError?: (message: string) => void
): Effect.Effect<void, HttpTransportError, HttpServerFactoryService | Scope.Scope> =>
  Effect.gen(function* () {
    const factory = yield* HttpServerFactoryService
    const writeError = configuredWriteError ?? factory.writeError ?? writeStderr
    const mounted = createMountedMcpHttpHandler(createServer, config.authToken, writeError, config.host)

    yield* Effect.addFinalizer(() => Effect.promise(() => mounted.close()))

    const server = yield* factory.make(config.port, config.host)
    yield* server.serve(createMcpHttpApp(mounted))

    yield* Effect.sync(() => {
      writeError(`MCP HTTP server listening on http://${config.host}:${config.port}/mcp\n`)
    })

    yield* Effect.async<void, never>((resume) => {
      const cleanup = () => {
        process.off("SIGINT", shutdown)
        process.off("SIGTERM", shutdown)
      }
      const shutdown = () => {
        cleanup()
        resume(Effect.void)
      }
      process.on("SIGINT", shutdown)
      process.on("SIGTERM", shutdown)
      return Effect.sync(cleanup)
    })
  })
