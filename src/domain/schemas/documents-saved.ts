import { Schema } from "effect"

import { toDraft07JsonSchema } from "./json-schema.js"
import { optionalOutput } from "./output-helpers.js"

import {
  DocumentId,
  DocumentIdentifier,
  LimitParam,
  ListTotal,
  NonEmptyString,
  SavedDocumentId,
  TeamspaceIdentifier,
  Timestamp,
  UrlString
} from "./shared.js"

export const SaveDocumentParamsSchema = Schema.Struct({
  teamspace: TeamspaceIdentifier.annotate({ description: "Teamspace name or ID" }),
  document: DocumentIdentifier.annotate({ description: "Document title or ID" })
}).annotate({ title: "SaveDocumentParams", description: "Parameters for saving/bookmarking a document" })

export type SaveDocumentParams = Schema.Schema.Type<typeof SaveDocumentParamsSchema>

export const UnsaveDocumentParamsSchema = Schema.Struct({
  teamspace: TeamspaceIdentifier.annotate({ description: "Teamspace name or ID" }),
  document: DocumentIdentifier.annotate({ description: "Document title or ID" })
}).annotate({ title: "UnsaveDocumentParams", description: "Parameters for removing a document from saved/bookmarks" })

export type UnsaveDocumentParams = Schema.Schema.Type<typeof UnsaveDocumentParamsSchema>

export const ListSavedDocumentsParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotate({
      description:
        "Maximum number of saved-document preferences to scan before stale/inaccessible entries are skipped (default: 50)"
    })
  )
}).annotate({ title: "ListSavedDocumentsParams", description: "Parameters for listing saved/bookmarked documents" })

export type ListSavedDocumentsParams = Schema.Schema.Type<typeof ListSavedDocumentsParamsSchema>

export const SavedDocumentWireSchema = Schema.Struct({
  savedId: SavedDocumentId,
  documentId: DocumentId,
  title: NonEmptyString,
  teamspace: NonEmptyString,
  url: UrlString,
  modifiedOn: optionalOutput(Timestamp)
})

export type SavedDocumentSummary = Schema.Schema.Type<typeof SavedDocumentWireSchema>

export const SaveDocumentResultSchema = Schema.Struct({
  savedId: SavedDocumentId,
  documentId: DocumentId,
  created: Schema.Boolean
})

export type SaveDocumentResult = Schema.Schema.Type<typeof SaveDocumentResultSchema>

export const UnsaveDocumentResultSchema = Schema.Struct({ documentId: DocumentId, removed: Schema.Boolean })

export type UnsaveDocumentResult = Schema.Schema.Type<typeof UnsaveDocumentResultSchema>

export const ListSavedDocumentsResultSchema = Schema.Struct({
  documents: Schema.Array(SavedDocumentWireSchema),
  total: ListTotal
})

export type ListSavedDocumentsResult = Schema.Schema.Type<typeof ListSavedDocumentsResultSchema>

export const saveDocumentParamsJsonSchema = toDraft07JsonSchema(SaveDocumentParamsSchema)
export const unsaveDocumentParamsJsonSchema = toDraft07JsonSchema(UnsaveDocumentParamsSchema)
export const listSavedDocumentsParamsJsonSchema = toDraft07JsonSchema(ListSavedDocumentsParamsSchema)

export const parseSaveDocumentParams = Schema.decodeUnknownEffect(SaveDocumentParamsSchema)
export const parseUnsaveDocumentParams = Schema.decodeUnknownEffect(UnsaveDocumentParamsSchema)
export const parseListSavedDocumentsParams = Schema.decodeUnknownEffect(ListSavedDocumentsParamsSchema)
