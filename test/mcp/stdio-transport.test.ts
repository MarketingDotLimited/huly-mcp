import { describe, it } from "@effect/vitest"
import { Effect, Fiber, Layer, Queue, Schema, Sink, Stdio, Stream } from "effect"
import { McpProtocol, McpServer } from "effect/unstable/ai"
import { expect } from "vitest"

const McpProtocolVersionSchema = Schema.Literals(["2026-07-28", "2025-06-18"])
const JsonRpcResponseSchema = Schema.Union([
  Schema.Struct({
    jsonrpc: Schema.Literal("2.0"),
    id: Schema.Literal(0),
    result: Schema.Struct({ supportedVersions: Schema.Array(McpProtocolVersionSchema) })
  }),
  Schema.Struct({
    jsonrpc: Schema.Literal("2.0"),
    id: Schema.Literal(1),
    result: Schema.Struct({ protocolVersion: McpProtocolVersionSchema })
  }),
  Schema.Struct({ jsonrpc: Schema.Literal("2.0"), id: Schema.Literal(2), result: Schema.Struct({}) })
])

const readResponse = Effect.fn("readResponse")(function* (stdout: Queue.Queue<string | Uint8Array>) {
  const chunk = yield* Queue.take(stdout)
  const text = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk)
  return Schema.decodeUnknownSync(Schema.fromJsonString(JsonRpcResponseSchema))(text)
})

describe("Effect AI stdio protocol", () => {
  it.effect("serves stateless discovery and legacy initialization on one connection", () =>
    Effect.gen(function* () {
      const stdin = yield* Queue.unbounded<Uint8Array>()
      const stdout = yield* Queue.unbounded<string | Uint8Array>()
      const stdioLayer = Stdio.layerTest({
        stdin: Stream.fromQueue(stdin),
        stdout: () => Sink.forEach((chunk) => Queue.offer(stdout, chunk))
      })
      const serverFiber = yield* Effect.gen(function* () {
        yield* Layer.build(
          McpServer.layerStdio({
            name: "stdio-test",
            version: "1.0.0",
            protocols: [McpProtocol.v2026_07_28, McpProtocol.v2025_06_18]
          }).pipe(Layer.provide(stdioLayer))
        )
        return yield* Effect.never
      }).pipe(Effect.scoped, Effect.forkScoped)

      const send = (message: unknown) => Queue.offer(stdin, new TextEncoder().encode(`${JSON.stringify(message)}\n`))
      yield* send({
        jsonrpc: "2.0",
        id: 0,
        method: "server/discover",
        params: {
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {},
            "io.modelcontextprotocol/clientInfo": { name: "stdio-test", version: "1.0.0" }
          }
        }
      })
      const discovered = yield* readResponse(stdout)
      expect(discovered.id).toBe(0)
      if (discovered.id === 0) expect(discovered.result.supportedVersions).toContain("2026-07-28")

      yield* send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "stdio-test", version: "1.0.0" }
        }
      })
      const initialized = yield* readResponse(stdout)
      expect(initialized.id).toBe(1)
      if (initialized.id === 1) expect(initialized.result.protocolVersion).toBe("2025-06-18")

      yield* send({ jsonrpc: "2.0", id: 2, method: "ping", params: {} })
      const ping = yield* readResponse(stdout)
      expect(ping).toEqual({ jsonrpc: "2.0", id: 2, result: {} })

      yield* Fiber.interrupt(serverFiber)
    })
  )
})
