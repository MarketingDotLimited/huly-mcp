import { Schema } from "effect"

import { toDraft07JsonSchema } from "./json-schema.js"
import { DocumentIdentifier, IssueIdentifier, ProjectIdentifier, TeamspaceIdentifier } from "./shared.js"

const docRelationFields = {
  project: ProjectIdentifier.annotate({ description: "Project identifier of the issue (e.g., 'HULY')" }),
  issueIdentifier: IssueIdentifier.annotate({ description: "Issue identifier (e.g., 'HULY-123')" }),
  teamspace: TeamspaceIdentifier.annotate({ description: "Teamspace containing the document (name or ID)" }),
  document: DocumentIdentifier.annotate({ description: "Document to link (title or ID)" })
}

export const LinkDocumentToIssueParamsSchema = Schema.Struct(docRelationFields).annotate({
  title: "LinkDocumentToIssueParams",
  description: "Parameters for linking a document to an issue"
})

export type LinkDocumentToIssueParams = Schema.Schema.Type<typeof LinkDocumentToIssueParamsSchema>

export const UnlinkDocumentFromIssueParamsSchema = Schema.Struct(docRelationFields).annotate({
  title: "UnlinkDocumentFromIssueParams",
  description: "Parameters for unlinking a document from an issue"
})

export type UnlinkDocumentFromIssueParams = Schema.Schema.Type<typeof UnlinkDocumentFromIssueParamsSchema>

export const linkDocumentToIssueParamsJsonSchema = toDraft07JsonSchema(LinkDocumentToIssueParamsSchema)
export const unlinkDocumentFromIssueParamsJsonSchema = toDraft07JsonSchema(UnlinkDocumentFromIssueParamsSchema)

export const parseLinkDocumentToIssueParams = Schema.decodeUnknownEffect(LinkDocumentToIssueParamsSchema)
export const parseUnlinkDocumentFromIssueParams = Schema.decodeUnknownEffect(UnlinkDocumentFromIssueParamsSchema)
export const LinkDocumentToIssueResultSchema = Schema.Struct({
  issue: Schema.String,
  document: Schema.String,
  documentTitle: Schema.String,
  linked: Schema.Boolean
})
export type LinkDocumentToIssueResult = Schema.Schema.Type<typeof LinkDocumentToIssueResultSchema>
export const UnlinkDocumentFromIssueResultSchema = Schema.Struct({
  issue: Schema.String,
  document: Schema.String,
  documentTitle: Schema.String,
  unlinked: Schema.Boolean
})
export type UnlinkDocumentFromIssueResult = Schema.Schema.Type<typeof UnlinkDocumentFromIssueResultSchema>
