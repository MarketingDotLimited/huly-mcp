import { Schema } from "effect"

import { toDraft07JsonSchema } from "./json-schema.js"
import {
  DEFAULT_LIMIT,
  DocId,
  DocumentId,
  DocumentIdentifier,
  LimitParam,
  ListTotal,
  NonEmptyString,
  TeamspaceId,
  TeamspaceIdentifier,
  Timestamp
} from "./shared.js"

export const DocumentSnapshotId = DocId.pipe(Schema.brand("DocumentSnapshotId"))
export type DocumentSnapshotId = Schema.Schema.Type<typeof DocumentSnapshotId>

export const DocumentSnapshotIdentifier = NonEmptyString.pipe(Schema.brand("DocumentSnapshotIdentifier"))
export type DocumentSnapshotIdentifier = Schema.Schema.Type<typeof DocumentSnapshotIdentifier>

export const DocumentSnapshotTitle = NonEmptyString.pipe(Schema.brand("DocumentSnapshotTitle"))
export type DocumentSnapshotTitle = Schema.Schema.Type<typeof DocumentSnapshotTitle>

export const DocumentMarkdown = Schema.String.pipe(Schema.brand("DocumentMarkdown")).annotate({
  identifier: "DocumentMarkdown",
  title: "DocumentMarkdown",
  description: "Markdown document content. Empty string is valid for an empty Huly document body."
})
export type DocumentMarkdown = Schema.Schema.Type<typeof DocumentMarkdown>

export const ListDocumentSnapshotsParamsSchema = Schema.Struct({
  teamspace: TeamspaceIdentifier.annotate({ description: "Document teamspace name or ID." }),
  document: DocumentIdentifier.annotate({ description: "Document title or ID within the teamspace." }),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of snapshots to return (default: ${DEFAULT_LIMIT}).` })
  )
}).annotate({
  title: "ListDocumentSnapshotsParams",
  description: "List version-history snapshots for one Huly document. Each snapshot is a point-in-time copy."
})
export type ListDocumentSnapshotsParams = Schema.Schema.Type<typeof ListDocumentSnapshotsParamsSchema>

export const GetDocumentSnapshotParamsSchema = Schema.Struct({
  teamspace: TeamspaceIdentifier.annotate({ description: "Document teamspace name or ID." }),
  document: DocumentIdentifier.annotate({ description: "Document title or ID within the teamspace." }),
  snapshot: DocumentSnapshotIdentifier.annotate({
    description:
      "Snapshot ID, exact snapshot title, or exact createdOn timestamp in milliseconds. Use list_document_snapshots first when unsure."
  })
}).annotate({
  title: "GetDocumentSnapshotParams",
  description: "Get one point-in-time document history snapshot and return its markdown content."
})
export type GetDocumentSnapshotParams = Schema.Schema.Type<typeof GetDocumentSnapshotParamsSchema>

export const DocumentSnapshotSummarySchema = Schema.Struct({
  snapshotId: DocumentSnapshotId,
  documentId: DocumentId,
  teamspaceId: TeamspaceId,
  title: DocumentSnapshotTitle,
  parentDocumentId: DocumentId,
  createdOn: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp)
}).annotate({
  title: "DocumentSnapshotSummary",
  description: "Point-in-time document history snapshot metadata without content."
})
export type DocumentSnapshotSummary = Schema.Schema.Type<typeof DocumentSnapshotSummarySchema>

export const DocumentSnapshotSchema = Schema.Struct({
  ...DocumentSnapshotSummarySchema.fields,
  markdown: Schema.optional(DocumentMarkdown)
}).annotate({
  title: "DocumentSnapshot",
  description: "Point-in-time document history snapshot metadata with markdown content."
})
export type DocumentSnapshot = Schema.Schema.Type<typeof DocumentSnapshotSchema>
export const ListDocumentSnapshotsResultSchema = Schema.Struct({
  snapshots: Schema.Array(DocumentSnapshotSummarySchema),
  total: ListTotal
})
export type ListDocumentSnapshotsResult = Schema.Schema.Type<typeof ListDocumentSnapshotsResultSchema>

export const GetDocumentSnapshotResultSchema = DocumentSnapshotSchema
export type GetDocumentSnapshotResult = Schema.Schema.Type<typeof GetDocumentSnapshotResultSchema>

export const listDocumentSnapshotsParamsJsonSchema = toDraft07JsonSchema(ListDocumentSnapshotsParamsSchema)
export const getDocumentSnapshotParamsJsonSchema = toDraft07JsonSchema(GetDocumentSnapshotParamsSchema)

export const parseListDocumentSnapshotsParams = Schema.decodeUnknownEffect(ListDocumentSnapshotsParamsSchema)
export const parseGetDocumentSnapshotParams = Schema.decodeUnknownEffect(GetDocumentSnapshotParamsSchema)
