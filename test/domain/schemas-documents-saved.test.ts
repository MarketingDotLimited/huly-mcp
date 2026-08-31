import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import {
  ListSavedDocumentsResultSchema,
  listSavedDocumentsParamsJsonSchema,
  parseListSavedDocumentsParams,
  parseSaveDocumentParams,
  parseUnsaveDocumentParams,
  SavedDocumentWireSchema,
  SaveDocumentResultSchema,
  saveDocumentParamsJsonSchema,
  UnsaveDocumentResultSchema,
  unsaveDocumentParamsJsonSchema
} from "../../src/domain/schemas/documents-saved.js"

describe("saved document schemas", () => {
  it.effect("decodes tool inputs and publishes required JSON Schema fields", () =>
    Effect.gen(function* () {
      expect(yield* parseSaveDocumentParams({ teamspace: "My Docs", document: "Design Notes" })).toEqual({
        teamspace: "My Docs",
        document: "Design Notes"
      })
      expect(yield* parseUnsaveDocumentParams({ teamspace: "My Docs", document: "doc-1" })).toEqual({
        teamspace: "My Docs",
        document: "doc-1"
      })
      expect(yield* parseListSavedDocumentsParams({ limit: 25 })).toEqual({ limit: 25 })
      expect(saveDocumentParamsJsonSchema.required).toEqual(["teamspace", "document"])
      expect(unsaveDocumentParamsJsonSchema.required).toEqual(["teamspace", "document"])
      expect(listSavedDocumentsParamsJsonSchema.properties).toHaveProperty("limit")
    })
  )

  it.effect("round-trips branded output payloads", () =>
    Effect.gen(function* () {
      const savedDocument = {
        savedId: "saved-doc-1",
        documentId: "doc-1",
        title: "Design Notes",
        teamspace: "My Docs",
        url: "https://huly.example/workbench/docs/doc-1",
        modifiedOn: 1_700_000_000_000
      }
      const schemasAndPayloads = [
        [SavedDocumentWireSchema, savedDocument],
        [SaveDocumentResultSchema, { savedId: "saved-doc-2", documentId: "doc-2", created: true }],
        [UnsaveDocumentResultSchema, { documentId: "doc-2", removed: false }],
        [ListSavedDocumentsResultSchema, { documents: [savedDocument], total: 1 }]
      ] as const

      for (const [schema, payload] of schemasAndPayloads) {
        const decoded = yield* Schema.decodeUnknownEffect(schema)(payload)
        expect(yield* Schema.encodeUnknownEffect(schema)(decoded)).toEqual(payload)
      }
    })
  )

  it.effect("rejects missing document selectors and invalid limits", () =>
    Effect.gen(function* () {
      expect((yield* Effect.flip(parseSaveDocumentParams({ teamspace: "My Docs" })))._tag).toBe("SchemaError")
      expect((yield* Effect.flip(parseListSavedDocumentsParams({ limit: 201 })))._tag).toBe("SchemaError")
    })
  )
})
