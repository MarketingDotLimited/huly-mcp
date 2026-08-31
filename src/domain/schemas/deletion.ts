import { Schema } from "effect"

import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"

import { Count, enumValuesDescription, ListTotal, ProjectIdentifier } from "./shared.js"

const EntityTypeValues = ["issue", "project", "component", "milestone"] as const

const EntityTypeSchema = Schema.Literals(EntityTypeValues).annotate({
  title: "EntityType",
  description: `Type of entity to preview deletion for: ${enumValuesDescription(EntityTypeValues)}`
})

export type EntityType = Schema.Schema.Type<typeof EntityTypeSchema>

export const PreviewDeletionParamsSchema = Schema.Struct({
  entityType: EntityTypeSchema.annotate({ description: `Type of entity: ${enumValuesDescription(EntityTypeValues)}` }),
  project: ProjectIdentifier.annotate({
    description: "Project identifier (e.g., 'HULY'). For entityType='project', this IS the target project."
  }),
  identifier: Schema.optional(Schema.String).annotate({
    description:
      "Entity identifier within the project. Required for issue (e.g., 'PROJ-123' or number), component (label or ID), milestone (label or ID). Ignored for entityType='project'."
  })
})
  .check(
    Schema.makeFilter((params) => {
      if (params.entityType !== "project" && (params.identifier === undefined || params.identifier.trim() === "")) {
        return { path: ["identifier"], issue: `identifier is required when entityType is '${params.entityType}'` }
      }
      return undefined
    })
  )
  .annotate({ title: "PreviewDeletionParams", description: "Parameters for previewing deletion impact" })

export type PreviewDeletionParams = Schema.Schema.Type<typeof PreviewDeletionParamsSchema>
export const DeletionImpactSchema = Schema.Struct({
  entityType: EntityTypeSchema,
  identifier: Schema.String,
  impact: Schema.Struct({
    subIssues: Schema.optional(Count),
    comments: Schema.optional(Count),
    attachments: Schema.optional(Count),
    blockedBy: Schema.optional(Count),
    relations: Schema.optional(Count),
    issues: Schema.optional(ListTotal),
    components: Schema.optional(ListTotal),
    milestones: Schema.optional(ListTotal),
    templates: Schema.optional(ListTotal)
  }),
  warnings: Schema.Array(Schema.String),
  totalAffected: ListTotal
})
export type DeletionImpact = Schema.Schema.Type<typeof DeletionImpactSchema>

export const previewDeletionParamsJsonSchema = {
  ...withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(PreviewDeletionParamsSchema), {
    entityType: `Type of entity: ${enumValuesDescription(EntityTypeValues)}.`,
    project: "Project identifier. For entityType=project, this is the target project.",
    identifier:
      "Entity identifier within the project. Required for issues, components, and milestones; ignored for projects."
  }),
  allOf: [
    {
      if: { required: ["entityType"], properties: { entityType: { enum: ["issue", "component", "milestone"] } } },
      then: { required: ["identifier"] }
    }
  ]
}
export const parsePreviewDeletionParams = Schema.decodeUnknownEffect(PreviewDeletionParamsSchema)

export const PreviewDeletionResultSchema = DeletionImpactSchema
