import { Schema } from "effect"

import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"

import {
  DocumentId,
  enumValuesDescription,
  IssueId,
  IssueIdentifier,
  ObjectClassName,
  ProjectIdentifier,
  TeamspaceIdentifier
} from "./shared.js"

export const RelationTypeValues = ["blocks", "is-blocked-by", "relates-to"] as const
type RelationTypeValue = (typeof RelationTypeValues)[number]

const RelationTypeDescriptions = {
  blocks: "source blocks target",
  "is-blocked-by": "source is blocked by target",
  "relates-to": "bidirectional link"
} satisfies Record<RelationTypeValue, string>

const relationTypeDescription = enumValuesDescription(
  RelationTypeValues.map((value) => `'${value}' (${RelationTypeDescriptions[value]})`)
)

export const RelationTypeSchema = Schema.Literals(RelationTypeValues).annotate({
  title: "RelationType",
  description: `Type of issue relation: ${relationTypeDescription}`,
  jsonSchema: { type: "string", enum: [...RelationTypeValues] }
})

export type RelationType = Schema.Schema.Type<typeof RelationTypeSchema>

const issueRelationFields = {
  project: ProjectIdentifier.annotate({ description: "Project identifier of the source issue (e.g., 'HULY')" }),
  issueIdentifier: IssueIdentifier.annotate({ description: "Source issue identifier (e.g., 'HULY-123')" }),
  targetIssue: IssueIdentifier.annotate({
    description: "Target issue identifier — same project: '42' or 'PROJ-42'; cross-project: 'OTHER-42'"
  }),
  relationType: RelationTypeSchema
}

export const AddIssueRelationParamsSchema = Schema.Struct(issueRelationFields).annotate({
  title: "AddIssueRelationParams",
  description: "Parameters for adding a relation between two issues"
})

export type AddIssueRelationParams = Schema.Schema.Type<typeof AddIssueRelationParamsSchema>

export const RemoveIssueRelationParamsSchema = Schema.Struct(issueRelationFields).annotate({
  title: "RemoveIssueRelationParams",
  description: "Parameters for removing a relation between two issues"
})

export type RemoveIssueRelationParams = Schema.Schema.Type<typeof RemoveIssueRelationParamsSchema>

export const ListIssueRelationsParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" }),
  issueIdentifier: IssueIdentifier.annotate({ description: "Issue identifier (e.g., 'HULY-123')" })
}).annotate({ title: "ListIssueRelationsParams", description: "Parameters for listing all relations of an issue" })

export type ListIssueRelationsParams = Schema.Schema.Type<typeof ListIssueRelationsParamsSchema>

const issueRelationDescriptions = {
  project: "Project identifier of the source issue.",
  issueIdentifier: "Source issue identifier.",
  targetIssue: "Target issue identifier; cross-project identifiers are accepted.",
  relationType: `Relation type: ${relationTypeDescription}.`
} as const

export const addIssueRelationParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(AddIssueRelationParamsSchema),
  issueRelationDescriptions
)
export const removeIssueRelationParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(RemoveIssueRelationParamsSchema),
  issueRelationDescriptions
)
export const listIssueRelationsParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(ListIssueRelationsParamsSchema),
  { project: issueRelationDescriptions.project, issueIdentifier: issueRelationDescriptions.issueIdentifier }
)

export const parseAddIssueRelationParams = Schema.decodeUnknownEffect(AddIssueRelationParamsSchema)
export const parseRemoveIssueRelationParams = Schema.decodeUnknownEffect(RemoveIssueRelationParamsSchema)
export const parseListIssueRelationsParams = Schema.decodeUnknownEffect(ListIssueRelationsParamsSchema)
export const RelationEntrySchema = Schema.Struct({ identifier: IssueIdentifier, _id: IssueId, _class: ObjectClassName })
export type RelationEntry = Schema.Schema.Type<typeof RelationEntrySchema>
export const DocumentRelationEntrySchema = Schema.Struct({
  title: Schema.String,
  teamspace: TeamspaceIdentifier,
  _id: DocumentId,
  _class: ObjectClassName
})
export type DocumentRelationEntry = Schema.Schema.Type<typeof DocumentRelationEntrySchema>

export const RelationEntryWireSchema = Schema.Struct({
  identifier: IssueIdentifier,
  _id: IssueId,
  _class: ObjectClassName
})

export const DocumentRelationEntryWireSchema = Schema.Struct({
  title: Schema.String,
  teamspace: TeamspaceIdentifier,
  _id: DocumentId,
  _class: ObjectClassName
})

export const AddIssueRelationResultSchema = Schema.Struct({
  sourceIssue: IssueIdentifier,
  targetIssue: IssueIdentifier,
  relationType: RelationTypeSchema,
  added: Schema.Boolean
})
export type AddIssueRelationResult = Schema.Schema.Type<typeof AddIssueRelationResultSchema>

export const RemoveIssueRelationResultSchema = Schema.Struct({
  sourceIssue: IssueIdentifier,
  targetIssue: IssueIdentifier,
  relationType: RelationTypeSchema,
  removed: Schema.Boolean
})
export type RemoveIssueRelationResult = Schema.Schema.Type<typeof RemoveIssueRelationResultSchema>

export const ListIssueRelationsResultSchema = Schema.Struct({
  blockedBy: Schema.Array(RelationEntryWireSchema),
  blocks: Schema.Array(RelationEntryWireSchema),
  relations: Schema.Array(RelationEntryWireSchema),
  documents: Schema.Array(DocumentRelationEntryWireSchema)
})
export type ListIssueRelationsResult = Schema.Schema.Type<typeof ListIssueRelationsResultSchema>
