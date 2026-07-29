import { Schema } from "effect"

import { ActivityMessageWireSchema } from "./activity.js"
import { AttachmentSummaryWireSchema, AttachmentWireSchema } from "./attachments.js"
import { CommentSchema } from "./comments.js"
import { ResolvedObjectSummarySchema } from "./generic-associations.js"
import {
  ApplicantRefSchema,
  CandidateRefSchema,
  OpinionRefSchema,
  ReviewRefSchema,
  VacancyRefSchema
} from "./recruiting-common.js"
import {
  AttachmentId,
  BlobId,
  CommentId,
  Count,
  DocId,
  NonEmptyString,
  ObjectClassName,
  SpaceId,
  Timestamp,
  UrlString
} from "./shared.js"

const RecruitingTargetBaseSchema = { objectClass: ObjectClassName, space: SpaceId, display: NonEmptyString } as const

export const RecruitingResolvedTargetSchema = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal("vacancy"),
    id: VacancyRefSchema.fields.id,
    ...RecruitingTargetBaseSchema,
    ref: VacancyRefSchema
  }),
  Schema.Struct({
    kind: Schema.Literal("candidate"),
    id: CandidateRefSchema.fields.id,
    ...RecruitingTargetBaseSchema,
    ref: CandidateRefSchema
  }),
  Schema.Struct({
    kind: Schema.Literal("applicant"),
    id: ApplicantRefSchema.fields.id,
    ...RecruitingTargetBaseSchema,
    ref: ApplicantRefSchema
  }),
  Schema.Struct({
    kind: Schema.Literal("review"),
    id: ReviewRefSchema.fields.id,
    ...RecruitingTargetBaseSchema,
    ref: ReviewRefSchema
  }),
  Schema.Struct({
    kind: Schema.Literal("opinion"),
    id: OpinionRefSchema.fields.id,
    ...RecruitingTargetBaseSchema,
    ref: OpinionRefSchema
  })
).annotations({
  title: "RecruitingResolvedTarget",
  description: "Resolved Recruiting object target with raw object details and a stable domain ref."
})
export type RecruitingResolvedTarget = Schema.Schema.Type<typeof RecruitingResolvedTargetSchema>

export const ListRecruitingCommentsResultSchema = Schema.Struct({
  target: RecruitingResolvedTargetSchema,
  comments: Schema.Array(CommentSchema),
  total: Count
})
export const AddRecruitingCommentResultSchema = Schema.Struct({
  target: RecruitingResolvedTargetSchema,
  commentId: CommentId
})
export const UpdateRecruitingCommentResultSchema = Schema.Struct({
  target: RecruitingResolvedTargetSchema,
  commentId: CommentId,
  updated: Schema.Boolean
})
export const DeleteRecruitingCommentResultSchema = Schema.Struct({
  target: RecruitingResolvedTargetSchema,
  commentId: CommentId,
  deleted: Schema.Boolean
})

export const ListRecruitingAttachmentsResultSchema = Schema.Struct({
  target: RecruitingResolvedTargetSchema,
  attachments: Schema.Array(AttachmentSummaryWireSchema),
  total: Count
})
export const GetRecruitingAttachmentResultSchema = Schema.Struct({
  target: RecruitingResolvedTargetSchema,
  attachment: AttachmentWireSchema
})
export const AddRecruitingAttachmentResultSchema = Schema.Struct({
  target: RecruitingResolvedTargetSchema,
  attachmentId: AttachmentId,
  blobId: BlobId,
  url: UrlString
})
export const UpdateRecruitingAttachmentResultSchema = Schema.Struct({
  target: RecruitingResolvedTargetSchema,
  attachmentId: AttachmentId,
  updated: Schema.Boolean
})
export const DeleteRecruitingAttachmentResultSchema = Schema.Struct({
  target: RecruitingResolvedTargetSchema,
  attachmentId: AttachmentId,
  deleted: Schema.Boolean
})

export const ListRecruitingActivityResultSchema = Schema.Struct({
  target: RecruitingResolvedTargetSchema,
  activity: Schema.Array(ActivityMessageWireSchema),
  total: Count
})

export const RecruitingRelatedIssueSchema = Schema.Struct({
  issue: ResolvedObjectSummarySchema,
  createdOn: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp)
})
export const ListRecruitingRelatedIssuesResultSchema = Schema.Struct({
  target: RecruitingResolvedTargetSchema,
  relatedIssues: Schema.Array(RecruitingRelatedIssueSchema),
  total: Count
})
export const AddRecruitingRelatedIssueResultSchema = Schema.Struct({
  target: RecruitingResolvedTargetSchema,
  issueId: DocId,
  created: Schema.Boolean,
  existing: Schema.Boolean
})
export const RemoveRecruitingRelatedIssueResultSchema = Schema.Struct({
  target: RecruitingResolvedTargetSchema,
  issueId: DocId,
  deleted: Schema.Boolean
})

export type ListRecruitingCommentsResult = Schema.Schema.Type<typeof ListRecruitingCommentsResultSchema>
export type AddRecruitingCommentResult = Schema.Schema.Type<typeof AddRecruitingCommentResultSchema>
export type UpdateRecruitingCommentResult = Schema.Schema.Type<typeof UpdateRecruitingCommentResultSchema>
export type DeleteRecruitingCommentResult = Schema.Schema.Type<typeof DeleteRecruitingCommentResultSchema>
export type ListRecruitingAttachmentsResult = Schema.Schema.Type<typeof ListRecruitingAttachmentsResultSchema>
export type GetRecruitingAttachmentResult = Schema.Schema.Type<typeof GetRecruitingAttachmentResultSchema>
export type AddRecruitingAttachmentResult = Schema.Schema.Type<typeof AddRecruitingAttachmentResultSchema>
export type UpdateRecruitingAttachmentResult = Schema.Schema.Type<typeof UpdateRecruitingAttachmentResultSchema>
export type DeleteRecruitingAttachmentResult = Schema.Schema.Type<typeof DeleteRecruitingAttachmentResultSchema>
export type ListRecruitingActivityResult = Schema.Schema.Type<typeof ListRecruitingActivityResultSchema>
export type ListRecruitingRelatedIssuesResult = Schema.Schema.Type<typeof ListRecruitingRelatedIssuesResultSchema>
export type AddRecruitingRelatedIssueResult = Schema.Schema.Type<typeof AddRecruitingRelatedIssueResultSchema>
export type RemoveRecruitingRelatedIssueResult = Schema.Schema.Type<typeof RemoveRecruitingRelatedIssueResultSchema>
