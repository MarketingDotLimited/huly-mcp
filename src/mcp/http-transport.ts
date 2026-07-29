/**
 * MCP 2026-07-28 HTTP transport with SDK-owned 2025 compatibility.
 *
 * The official SDK owns the MCP wire boundary. Express remains only as the
 * current Node HTTP mount and can be replaced independently.
 */
import { timingSafeEqual } from "node:crypto"
import type http from "node:http"

import { createMcpExpressApp } from "@modelcontextprotocol/express"
import { toNodeHandler } from "@modelcontextprotocol/node"
import { createMcpHandler, type McpServerFactory } from "@modelcontextprotocol/server"
import type { Scope } from "effect"
import { Context, Effect, Layer, Schema } from "effect"
import type { Express, Request, Response } from "express"

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
  readonly createApp: (host: string) => Express
  readonly listen: (app: Express, port: number, host: string) => Effect.Effect<http.Server, HttpTransportError>
  readonly writeError?: (message: string) => void
}

const defaultHttpServerFactory: HttpServerFactory = {
  createApp: (host) => createMcpExpressApp({ host }),
  listen: (app, port, host) =>
    Effect.async<http.Server, HttpTransportError>((resume) => {
      const server = app.listen(port, host, (error?: Error) => {
        if (error) {
          resume(
            Effect.fail(
              new HttpTransportError({
                message: `Failed to start HTTP server on ${host}:${port}: ${error.message}`,
                cause: error
              })
            )
          )
        } else {
          resume(Effect.succeed(server))
        }
      })
    }),
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

const isAuthorizedMcpRequest = (req: Request, authToken: string | undefined): boolean => {
  const expected = activeAuthToken(authToken)
  if (expected === undefined) return true
  const received = extractBearerToken(req.headers.authorization)
  return received !== undefined && tokenMatches(received, expected)
}

const writeUnauthorized = (res: Response): void => {
  res.setHeader("WWW-Authenticate", "Bearer")
  res.status(HTTP_UNAUTHORIZED).json({ jsonrpc: "2.0", error: { code: -32000, message: "Unauthorized" }, id: null })
}

export interface MountedMcpHttpHandler {
  readonly handle: (req: Request, res: Response) => Promise<void>
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
  writeError: (message: string) => void = writeStderr
): MountedMcpHttpHandler => {
  const reportError = (error: Error): void => {
    writeError(`MCP HTTP handler error: ${error.message}\n`)
  }
  const closeTracker = createMcpServerCloseTracker(createServer)
  const activeRequests = new Set<Promise<void>>()
  const mcpHandler = createMcpHandler(closeTracker.factory, { legacy: "stateless", onerror: reportError })
  const nodeHandler = toNodeHandler(mcpHandler, { onerror: reportError })

  return {
    handle: async (req, res) => {
      if (!isAuthorizedMcpRequest(req, authToken)) {
        writeUnauthorized(res)
        return
      }
      const request = nodeHandler(req, res, req.body)
      activeRequests.add(request)
      try {
        await request
      } finally {
        activeRequests.delete(request)
      }
    },
    close: async () => {
      await mcpHandler.close()
      while (activeRequests.size > 0) await Promise.allSettled([...activeRequests])
      await closeTracker.drain()
    }
  }
}

const closeHttpServer = (server: http.Server): Effect.Effect<void, HttpTransportError> =>
  Effect.async<void, HttpTransportError>((resume) => {
    server.close((error?: Error) => {
      if (error) {
        resume(
          Effect.fail(new HttpTransportError({ message: `Error closing HTTP server: ${error.message}`, cause: error }))
        )
      } else {
        resume(Effect.void)
      }
    })
  })

export const startHttpTransport = (
  config: HttpTransportConfig,
  createServer: McpServerFactory,
  configuredWriteError?: (message: string) => void
): Effect.Effect<void, HttpTransportError, HttpServerFactoryService | Scope.Scope> =>
  Effect.gen(function* () {
    const factory = yield* HttpServerFactoryService
    const writeError = configuredWriteError ?? factory.writeError ?? writeStderr
    const mounted = createMountedMcpHttpHandler(createServer, config.authToken, writeError)

    yield* Effect.addFinalizer(() => Effect.promise(() => mounted.close()))

    const app = factory.createApp(config.host)
    app.all("/mcp", (req, res) => {
      void mounted.handle(req, res)
    })

    yield* Effect.acquireRelease(factory.listen(app, config.port, config.host), (server) =>
      closeHttpServer(server).pipe(
        Effect.catchAll((error) =>
          Effect.sync(() => {
            writeError(`Server close error: ${error.message}\n`)
          })
        )
      )
    )

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
