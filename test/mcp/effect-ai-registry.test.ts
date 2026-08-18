import { describe, it } from "@effect/vitest"
import { Effect, Exit, Schema } from "effect"
import { McpServer } from "effect/unstable/ai/McpServer"
import * as McpSchema from "effect/unstable/ai/McpSchema"
import { expect } from "vitest"

import { CanonicalBase64ImageData, SupportedAttachmentImageTypeSchema } from "../../src/domain/schemas/attachments.js"
import { createImageSuccessResponse, McpErrorCode } from "../../src/mcp/error-mapping.js"
import { HulyConnectionError } from "../../src/huly/errors-base.js"
import {
  makeEffectMcpRegistry,
  toEffectCallToolResult
} from "../../src/mcp/effect-ai-registry.js"
import { fetchLatestNpmVersion } from "../../src/mcp/effect-ai-dispatch.js"
import { requestScopedResolver } from "../../src/mcp/effect-ai-request.js"
import { McpRequestContextService } from "../../src/mcp/request-context.js"
import { createErrorResponse } from "../../src/mcp/tool-responses.js"
import { StatusMetadataUnresolvedWarningCode } from "../../src/domain/schemas/tool-warnings.js"
import { sanitizeHulyRuntimeConfigFromEnv } from "../../src/config/config.js"
import { toolRegistry } from "../../src/mcp/tools/index.js"
import type { TelemetryOperations } from "../../src/telemetry/telemetry.js"

const telemetry: TelemetryOperations = {
  sessionStart: () => {},
  firstListTools: () => {},
  toolCalled: () => {},
  shutdown: async () => {}
}

const WireCallToolResultSchema = Schema.Struct({
  content: Schema.Array(
    Schema.Union([
      Schema.Struct({ type: Schema.Literal("text"), text: Schema.String }),
      Schema.Struct({ type: Schema.Literal("image"), data: Schema.String, mimeType: Schema.String })
    ])
  ),
  structuredContent: Schema.optional(Schema.Unknown),
  isError: Schema.optional(Schema.Boolean),
  _meta: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
})

const encodeWireCallToolResult = (result: typeof McpSchema.CallToolResult.Type) =>
  Schema.decodeUnknownSync(WireCallToolResultSchema)(
    Schema.encodeUnknownSync(Schema.toCodecJson(McpSchema.CallToolResult))(result)
  )

describe("Effect AI MCP registry adapter", () => {
  it("reads the latest package version through the injected fetch boundary", async () => {
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ version: "9.9.9" }), { status: 200 })

    await expect(fetchLatestNpmVersion(fetchImpl)).resolves.toBe("9.9.9")
  })

  it("returns unknown when the latest package response is unavailable", async () => {
    const fetchImpl: typeof fetch = async () => new Response("", { status: 503 })

    await expect(fetchLatestNpmVersion(fetchImpl)).resolves.toBe("unknown")
  })

  it("maps Huly rich image results and warnings to Effect MCP content", () => {
    const imageData = CanonicalBase64ImageData.make("dW5pcXVlLWltYWdlLWJ5dGVz")
    const imageType = Schema.decodeUnknownSync(SupportedAttachmentImageTypeSchema)("image/png")
    const response = createImageSuccessResponse(
      { name: "shot.png" },
      { type: "image", data: imageData, mimeType: imageType },
      [{ code: StatusMetadataUnresolvedWarningCode, message: "The preview is abbreviated." }]
    )

    const encoded = encodeWireCallToolResult(toEffectCallToolResult(response))

    expect(encoded.content).toEqual([
      { type: "text", text: JSON.stringify({ name: "shot.png" }) },
      { type: "text", text: JSON.stringify({ warnings: response.structuredContent?.warnings }) },
      { type: "image", data: imageData, mimeType: "image/png" }
    ])
    expect(encoded.structuredContent).toEqual(response.structuredContent)
  })

  it("keeps Huly error metadata on an Effect MCP tool result", () => {
    const response = createErrorResponse("Invalid issue", McpErrorCode.InvalidParams, "IssueNotFound")
    const encoded = encodeWireCallToolResult(toEffectCallToolResult(response))

    expect(encoded.isError).toBe(true)
    expect(encoded.content).toEqual([{ type: "text", text: "Invalid issue" }])
    expect(encoded._meta).toEqual({ errorCode: McpErrorCode.InvalidParams, errorTag: "IssueNotFound" })
  })

  it.effect("prefers the resolver attached to the current request fiber", () => {
    const fallback = async () => Exit.fail(new HulyConnectionError({ message: "fallback" }))
    const requestResolver = async () => Exit.fail(new HulyConnectionError({ message: "request" }))
    return Effect.gen(function* () {
      const resolver = yield* requestScopedResolver(fallback)
      expect(resolver).toBe(requestResolver)
    }).pipe(
      Effect.provideService(
        McpRequestContextService,
        McpRequestContextService.of({
          runtimeConfig: sanitizeHulyRuntimeConfigFromEnv({}),
          resolveClients: requestResolver
        })
      )
    )
  })

  it.effect("registers every tool and all Huly resource templates in one Effect", () =>
    Effect.gen(function* () {
      const adapter = makeEffectMcpRegistry({
        resolveClients: async () => Exit.fail(new HulyConnectionError({ message: "not used" })),
        telemetry,
        registry: toolRegistry,
        getHulyContext: () => {
          throw new Error("context is not used during registration")
        }
      })

      yield* adapter.registration
      const server = yield* McpServer
      expect(server.tools.length).toBeGreaterThan(toolRegistry.definitions.length)
      expect(server.resourceTemplates).toHaveLength(3)
    }).pipe(Effect.provide(McpServer.layer))
  )
})
