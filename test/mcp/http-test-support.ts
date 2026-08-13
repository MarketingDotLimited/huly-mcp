import * as http from "node:http"

import { NodeHttpServer } from "@effect/platform-node"
import type { McpServerFactory } from "@modelcontextprotocol/server"
import { Effect, Exit, Redacted, Scope } from "effect"

import {
  createMcpHttpApp,
  createMountedMcpHttpHandler,
  type HttpServerFactory,
  HttpTransportError,
  httpServeError
} from "../../src/mcp/http-transport.js"

export const makeTestHttpServerFactory = (
  onListening: (server: http.Server) => void,
  writeError?: (message: string) => void
): HttpServerFactory => ({
  make: (port, host) => {
    const rawServer = http.createServer()
    return NodeHttpServer.make(() => rawServer, { port, host }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          onListening(rawServer)
        })
      ),
      Effect.mapError((error) => httpServeError(host, port, error))
    )
  },
  ...(writeError === undefined ? {} : { writeError })
})

interface TestHttpEndpoint {
  readonly baseUrl: string
  readonly server: http.Server
  readonly close: () => Promise<void>
}

export const listenTestMcpHttpServer = async (
  createServer: McpServerFactory,
  authToken?: string,
  writeError: (message: string) => void = () => {}
): Promise<TestHttpEndpoint> => {
  const scope = await Effect.runPromise(Scope.make())
  const mounted = createMountedMcpHttpHandler(
    createServer,
    authToken === undefined ? undefined : Redacted.make(authToken),
    writeError
  )
  const closeScope = (): Promise<void> => Effect.runPromise(Scope.close(scope, Exit.void))

  try {
    const rawServer = http.createServer()
    const server = await Effect.runPromise(
      NodeHttpServer.make(() => rawServer, { port: 0, host: "127.0.0.1" }).pipe(Scope.provide(scope))
    )
    const app = await Effect.runPromise(createMcpHttpApp(mounted).pipe(Scope.provide(scope)))
    await Effect.runPromise(server.serve(app).pipe(Scope.provide(scope)))
    const address = rawServer.address()
    if (address === null || typeof address === "string") throw new Error("Expected an assigned TCP port")

    return {
      baseUrl: `http://127.0.0.1:${address.port}/mcp`,
      server: rawServer,
      close: async () => {
        try {
          await Effect.runPromise(mounted.close)
        } finally {
          await closeScope()
        }
      }
    }
  } catch (error) {
    await Promise.allSettled([Effect.runPromise(mounted.close), closeScope()])
    throw error
  }
}

export const failingHttpServerFactory = (error: HttpTransportError): HttpServerFactory => ({
  make: () => Effect.fail(error)
})

export const inertHttpServerFactory = (errorMessage: string): HttpServerFactory => ({
  make: () => Effect.fail(new HttpTransportError({ message: errorMessage }))
})
