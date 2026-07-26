import { describe, it } from "@effect/vitest"
import { Effect, Either, Schema } from "effect"
import { expect } from "vitest"

import {
  addAttachmentParamsJsonSchema,
  addChatMessageAttachmentParamsJsonSchema,
  addDocumentAttachmentParamsJsonSchema,
  addIssueAttachmentParamsJsonSchema,
  addRecruitingAttachmentParamsJsonSchema,
  parseAddAttachmentParams,
  parseCreateDrawingParams,
  uploadDriveFileParamsJsonSchema,
  uploadDriveFileVersionParamsJsonSchema,
  uploadFileParamsJsonSchema
} from "../../../src/domain/schemas.js"
import { McpImageContentSchema } from "../../../src/domain/schemas/attachments.js"
import {
  addInventoryProductAttachmentParamsJsonSchema,
  addInventoryProductPhotoParamsJsonSchema
} from "../../../src/domain/schemas/inventory-media.js"

describe("attachment media schemas", () => {
  it("explains where each upload source is resolved", () => {
    for (
      const schema of [
        addAttachmentParamsJsonSchema,
        addIssueAttachmentParamsJsonSchema,
        addDocumentAttachmentParamsJsonSchema
      ]
    ) {
      const description = JSON.stringify(schema)
      expect(description).toContain("MCP server host")
      expect(description).toContain("MCP client")
      expect(description).toContain("fetched by the MCP server")
    }
  })

  it("applies the same server-host, client-local, and server-fetch semantics to every upload surface", () => {
    for (
      const schema of [
        uploadFileParamsJsonSchema,
        addChatMessageAttachmentParamsJsonSchema,
        addInventoryProductAttachmentParamsJsonSchema,
        addInventoryProductPhotoParamsJsonSchema,
        addRecruitingAttachmentParamsJsonSchema,
        uploadDriveFileParamsJsonSchema,
        uploadDriveFileVersionParamsJsonSchema
      ]
    ) {
      const description = JSON.stringify(schema)
      expect(description).toContain("MCP server host")
      expect(description).toContain("client-local")
      expect(description).toContain("fetched by the MCP server")
    }
  })

  it("owns MCP image blocks with base64 and supported image MIME schemas", () => {
    const valid = Schema.decodeUnknownEither(McpImageContentSchema)({
      type: "image",
      data: "cG5n",
      mimeType: "image/png"
    })
    const invalid = Schema.decodeUnknownEither(McpImageContentSchema)({
      type: "image",
      data: "cG5n",
      mimeType: "image/svg+xml"
    })

    expect(Either.isRight(valid)).toBe(true)
    expect(Either.isLeft(invalid)).toBe(true)
  })

  it.effect("accepts attachment media kinds and rejects unknown kinds", () =>
    Effect.gen(function*() {
      const defaultKind = yield* parseAddAttachmentParams({
        objectId: "issue-1",
        objectClass: "tracker:class:Issue",
        space: "space-1",
        filename: "diagram.png",
        contentType: "image/png",
        data: "aGVsbG8="
      })
      const photo = yield* parseAddAttachmentParams({
        objectId: "issue-1",
        objectClass: "tracker:class:Issue",
        space: "space-1",
        filename: "photo.png",
        contentType: "image/png",
        data: "aGVsbG8=",
        kind: "photo"
      })
      const invalid = yield* Effect.either(parseAddAttachmentParams({
        objectId: "issue-1",
        objectClass: "tracker:class:Issue",
        space: "space-1",
        filename: "photo.png",
        contentType: "image/png",
        data: "aGVsbG8=",
        kind: "video"
      }))

      expect(defaultKind.kind).toBeUndefined()
      expect(photo.kind).toBe("photo")
      expect(invalid._tag).toBe("Left")
    }))

  it.effect("parses drawing content as an opaque payload", () =>
    Effect.gen(function*() {
      const drawing = yield* parseCreateDrawingParams({
        parentId: "issue-1",
        parentClass: "tracker:class:Issue",
        space: "space-1",
        content: "{\"shape\":\"line\"}"
      })

      expect(drawing.content).toBe("{\"shape\":\"line\"}")
    }))
})
