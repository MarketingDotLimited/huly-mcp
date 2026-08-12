import { Schema } from "effect"

import { clearableText } from "./clearable.js"
import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "./document-native-references.js"
import { toDraft07JsonSchema } from "./json-schema.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  DEFAULT_LIMIT,
  enumValuesDescription,
  hasAtLeastOneDefined,
  IssueIdentifier,
  LimitParam,
  MilestoneId,
  MilestoneIdentifier,
  MilestoneLabel,
  ProjectIdentifier,
  Timestamp,
  withAtLeastOneRequired
} from "./shared.js"

export const MilestoneStatusValues = ["planned", "in-progress", "completed", "canceled"] as const

export const MilestoneStatusSchema = Schema.Literals(MilestoneStatusValues).annotate({
  title: "MilestoneStatus",
  description: `Milestone status: ${enumValuesDescription(MilestoneStatusValues)}`
})

export type MilestoneStatus = Schema.Schema.Type<typeof MilestoneStatusSchema>

export const MilestoneSummarySchema = Schema.Struct({
  id: MilestoneId,
  label: MilestoneLabel,
  status: MilestoneStatusSchema,
  targetDate: Timestamp,
  modifiedOn: Schema.optional(Timestamp)
}).annotate({ title: "MilestoneSummary", description: "Milestone summary for list operations" })

export type MilestoneSummary = Schema.Schema.Type<typeof MilestoneSummarySchema>

export const MilestoneSchema = Schema.Struct({
  id: MilestoneId,
  label: MilestoneLabel,
  description: Schema.optional(Schema.String),
  status: MilestoneStatusSchema,
  targetDate: Timestamp,
  project: ProjectIdentifier,
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
}).annotate({ title: "Milestone", description: "Full milestone with all fields" })

export type Milestone = Schema.Schema.Type<typeof MilestoneSchema>

export const ListMilestonesParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" }),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of milestones to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({ title: "ListMilestonesParams", description: "Parameters for listing milestones" })

export type ListMilestonesParams = Schema.Schema.Type<typeof ListMilestonesParamsSchema>

export const GetMilestoneParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" }),
  milestone: MilestoneIdentifier.annotate({ description: "Milestone ID or label" })
}).annotate({ title: "GetMilestoneParams", description: "Parameters for getting a single milestone" })

export type GetMilestoneParams = Schema.Schema.Type<typeof GetMilestoneParamsSchema>

export const CreateMilestoneParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" }),
  label: MilestoneLabel.annotate({ description: "Milestone name/label" }),
  description: Schema.optional(
    Schema.String.annotate({
      description: `Milestone description in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
    })
  ),
  targetDate: Timestamp.annotate({ description: "Target date as Unix timestamp in milliseconds" })
}).annotate({ title: "CreateMilestoneParams", description: "Parameters for creating a milestone" })

export type CreateMilestoneParams = Schema.Schema.Type<typeof CreateMilestoneParamsSchema>

export const UPDATE_MILESTONE_FIELDS = [
  "label",
  "description",
  "targetDate",
  "status"
] as const satisfies ReadonlyArray<"label" | "description" | "targetDate" | "status">

export const UpdateMilestoneParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" }),
  milestone: MilestoneIdentifier.annotate({ description: "Milestone ID or label" }),
  label: Schema.optional(MilestoneLabel.annotate({ description: "New milestone name/label" })),
  description: Schema.optional(
    clearableText(`New milestone description in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`)
  ),
  targetDate: Schema.optional(Timestamp.annotate({ description: "New target date as Unix timestamp in milliseconds" })),
  status: Schema.optional(MilestoneStatusSchema.annotate({ description: "New milestone status" }))
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_MILESTONE_FIELDS)
          ? undefined
          : atLeastOneUpdateFieldMessage(UPDATE_MILESTONE_FIELDS)
      )
    )
  )
  .annotate({
    title: "UpdateMilestoneParams",
    description: `Parameters for updating a milestone. ${atLeastOneUpdateFieldMessage(UPDATE_MILESTONE_FIELDS)}`
  })

export type UpdateMilestoneParams = Schema.Schema.Type<typeof UpdateMilestoneParamsSchema>
assertUpdateFields<UpdateMilestoneParams>()(["project", "milestone"], UPDATE_MILESTONE_FIELDS)

export const SetIssueMilestoneParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" }),
  identifier: IssueIdentifier.annotate({ description: "Issue identifier (e.g., 'HULY-123')" }),
  milestone: Schema.NullOr(MilestoneIdentifier).annotate({ description: "Milestone ID or label (null to clear)" })
}).annotate({ title: "SetIssueMilestoneParams", description: "Parameters for setting milestone on an issue" })

export type SetIssueMilestoneParams = Schema.Schema.Type<typeof SetIssueMilestoneParamsSchema>

export const DeleteMilestoneParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" }),
  milestone: MilestoneIdentifier.annotate({ description: "Milestone ID or label" })
}).annotate({ title: "DeleteMilestoneParams", description: "Parameters for deleting a milestone" })

export type DeleteMilestoneParams = Schema.Schema.Type<typeof DeleteMilestoneParamsSchema>

export const listMilestonesParamsJsonSchema = toDraft07JsonSchema(ListMilestonesParamsSchema)
export const getMilestoneParamsJsonSchema = toDraft07JsonSchema(GetMilestoneParamsSchema)
export const createMilestoneParamsJsonSchema = toDraft07JsonSchema(CreateMilestoneParamsSchema)
export const updateMilestoneParamsJsonSchema = withAtLeastOneRequired(
  toDraft07JsonSchema(UpdateMilestoneParamsSchema),
  UPDATE_MILESTONE_FIELDS
)
export const setIssueMilestoneParamsJsonSchema = toDraft07JsonSchema(SetIssueMilestoneParamsSchema)
export const deleteMilestoneParamsJsonSchema = toDraft07JsonSchema(DeleteMilestoneParamsSchema)

export const parseMilestone = Schema.decodeUnknownEffect(MilestoneSchema)
export const parseMilestoneSummary = Schema.decodeUnknownEffect(MilestoneSummarySchema)
export const parseListMilestonesParams = Schema.decodeUnknownEffect(ListMilestonesParamsSchema)
export const parseGetMilestoneParams = Schema.decodeUnknownEffect(GetMilestoneParamsSchema)
export const parseCreateMilestoneParams = Schema.decodeUnknownEffect(CreateMilestoneParamsSchema)
export const parseUpdateMilestoneParams = Schema.decodeUnknownEffect(UpdateMilestoneParamsSchema)
export const parseSetIssueMilestoneParams = Schema.decodeUnknownEffect(SetIssueMilestoneParamsSchema)
export const parseDeleteMilestoneParams = Schema.decodeUnknownEffect(DeleteMilestoneParamsSchema)
export const CreateMilestoneResultSchema = Schema.Struct({ id: MilestoneId, label: MilestoneLabel })
export type CreateMilestoneResult = Schema.Schema.Type<typeof CreateMilestoneResultSchema>
export const UpdateMilestoneResultSchema = Schema.Struct({ id: MilestoneId, updated: Schema.Boolean })
export type UpdateMilestoneResult = Schema.Schema.Type<typeof UpdateMilestoneResultSchema>
export const SetIssueMilestoneResultSchema = Schema.Struct({
  identifier: IssueIdentifier,
  milestoneSet: Schema.Boolean
})
export type SetIssueMilestoneResult = Schema.Schema.Type<typeof SetIssueMilestoneResultSchema>
export const DeleteMilestoneResultSchema = Schema.Struct({ id: MilestoneId, deleted: Schema.Boolean })
export type DeleteMilestoneResult = Schema.Schema.Type<typeof DeleteMilestoneResultSchema>

export const ListMilestonesResultSchema = Schema.Array(MilestoneSummarySchema)
export const GetMilestoneResultSchema = MilestoneSchema
