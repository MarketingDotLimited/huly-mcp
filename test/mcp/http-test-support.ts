import * as http from "node:http"

import { NodeHttpServer } from "@effect/platform-node"
import type { McpServerFactory } from "@modelcontextprotocol/server"
import { Effect, Exit, Scope } from "effect"

import {
  createMcpHttpApp,
  createMountedMcpHttpHandler,
  type HttpServerFactory,
  HttpTransportError
} from "../../src/mcp/http-transport.js"

const mapServeError = (host: string, port: number) => (error: { readonly cause: unknown }) =>
  new HttpTransportError({
    message: `Failed to start HTTP server on ${host}:${port}: ${String(error.cause)}`,
    cause: error
  })

export const makeTestHttpServerFactory = (
  onListening: (server: http.Server) => void,
  writeError?: (message: string) => void
): HttpServerFactory => ({
  make: (port, host) => {
    let rawServer: http.Server | undefined
    return NodeHttpServer.make(
      () => {
        const server = http.createServer()
        rawServer = server
        return server
      },
      { port, host }
    ).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          if (rawServer === undefined) throw new Error("Effect HTTP server factory did not create a Node server")
          onListening(rawServer)
        })
      ),
      Effect.mapError(mapServeError(host, port))
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
  let rawServer: http.Server | undefined
  const mounted = createMountedMcpHttpHandler(createServer, authToken, writeError)
  const server = await Effect.runPromise(
    NodeHttpServer.make(
      () => {
        const created = http.createServer()
        rawServer = created
        return created
      },
      { port: 0, host: "127.0.0.1" }
    ).pipe(Scope.extend(scope))
  )
  await Effect.runPromise(server.serve(createMcpHttpApp(mounted)).pipe(Scope.extend(scope)))
  if (rawServer === undefined) throw new Error("Effect HTTP server factory did not create a Node server")
  const address = rawServer.address()
  if (address === null || typeof address === "string") throw new Error("Expected an assigned TCP port")

  return {
    baseUrl: `http://127.0.0.1:${address.port}/mcp`,
    server: rawServer,
    close: async () => {
      await mounted.close()
      await Effect.runPromise(Scope.close(scope, Exit.void))
    }
  }
}

export const failingHttpServerFactory = (error: HttpTransportError): HttpServerFactory => ({
  make: () => Effect.fail(error)
})

export const inertHttpServerFactory = (errorMessage: string): HttpServerFactory => ({
  make: () => Effect.fail(new HttpTransportError({ message: errorMessage }))
})
