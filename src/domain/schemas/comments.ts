import { Schema } from "effect"

import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "./document-native-references.js"
import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import {
  CommentId,
  DEFAULT_LIMIT,
  IssueIdentifier,
  LimitParam,
  NonEmptyString,
  ProjectIdentifier,
  Timestamp
} from "./shared.js"

export const CommentSchema = Schema.Struct({
  id: CommentId,
  body: NonEmptyString,
  author: Schema.optional(Schema.String),
  authorId: Schema.optional(NonEmptyString),
  createdOn: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp),
  editedOn: Schema.optional(Schema.NullOr(Timestamp))
}).annotate({ title: "Comment", description: "Issue comment" })

export type Comment = Schema.Schema.Type<typeof CommentSchema>

export const ListCommentsParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotateKey({ description: "Project identifier (e.g., 'HULY')" }),
  issueIdentifier: IssueIdentifier.annotateKey({ description: "Issue identifier (e.g., 'HULY-123' or just '123')" }),
  limit: Schema.optional(
    LimitParam.annotateKey({ description: `Maximum number of comments to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({ title: "ListCommentsParams", description: "Parameters for listing comments on an issue" })

export type ListCommentsParams = Schema.Schema.Type<typeof ListCommentsParamsSchema>

export const AddCommentParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotateKey({ description: "Project identifier (e.g., 'HULY')" }),
  issueIdentifier: IssueIdentifier.annotateKey({ description: "Issue identifier (e.g., 'HULY-123' or just '123')" }),
  body: NonEmptyString.annotateKey({ description: `Comment body in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}` })
}).annotate({ title: "AddCommentParams", description: "Parameters for adding a comment to an issue" })

export type AddCommentParams = Schema.Schema.Type<typeof AddCommentParamsSchema>

export const UpdateCommentParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotateKey({ description: "Project identifier (e.g., 'HULY')" }),
  issueIdentifier: IssueIdentifier.annotateKey({ description: "Issue identifier (e.g., 'HULY-123' or just '123')" }),
  commentId: CommentId.annotateKey({ description: "Comment ID to update" }),
  body: NonEmptyString.annotateKey({
    description: `New comment body in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
  })
}).annotate({ title: "UpdateCommentParams", description: "Parameters for updating a comment" })

export type UpdateCommentParams = Schema.Schema.Type<typeof UpdateCommentParamsSchema>

export const DeleteCommentParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotateKey({ description: "Project identifier (e.g., 'HULY')" }),
  issueIdentifier: IssueIdentifier.annotateKey({ description: "Issue identifier (e.g., 'HULY-123' or just '123')" }),
  commentId: CommentId.annotateKey({ description: "Comment ID to delete" })
}).annotate({ title: "DeleteCommentParams", description: "Parameters for deleting a comment" })

export type DeleteCommentParams = Schema.Schema.Type<typeof DeleteCommentParamsSchema>

export const listCommentsParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(ListCommentsParamsSchema),
  {
    project: "Project identifier (e.g., 'HULY')",
    issueIdentifier: "Issue identifier (e.g., 'HULY-123' or just '123')",
    limit: `Maximum number of comments to return (default: ${DEFAULT_LIMIT})`
  }
)
export const addCommentParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(AddCommentParamsSchema),
  {
    project: "Project identifier (e.g., 'HULY')",
    issueIdentifier: "Issue identifier (e.g., 'HULY-123' or just '123')",
    body: `Comment body in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
  }
)
export const updateCommentParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(UpdateCommentParamsSchema),
  {
    project: "Project identifier (e.g., 'HULY')",
    issueIdentifier: "Issue identifier (e.g., 'HULY-123' or just '123')",
    commentId: "Comment ID to update",
    body: `New comment body in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
  }
)
export const deleteCommentParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(DeleteCommentParamsSchema),
  {
    project: "Project identifier (e.g., 'HULY')",
    issueIdentifier: "Issue identifier (e.g., 'HULY-123' or just '123')",
    commentId: "Comment ID to delete"
  }
)

export const parseComment = Schema.decodeUnknownEffect(CommentSchema)
export const parseListCommentsParams = Schema.decodeUnknownEffect(ListCommentsParamsSchema)
export const parseAddCommentParams = Schema.decodeUnknownEffect(AddCommentParamsSchema)
export const parseUpdateCommentParams = Schema.decodeUnknownEffect(UpdateCommentParamsSchema)
export const parseDeleteCommentParams = Schema.decodeUnknownEffect(DeleteCommentParamsSchema)
export const AddCommentResultSchema = Schema.Struct({ commentId: CommentId, issueIdentifier: IssueIdentifier })
export type AddCommentResult = Schema.Schema.Type<typeof AddCommentResultSchema>
export const UpdateCommentResultSchema = Schema.Struct({
  commentId: CommentId,
  issueIdentifier: IssueIdentifier,
  updated: Schema.Boolean
})
export type UpdateCommentResult = Schema.Schema.Type<typeof UpdateCommentResultSchema>
export const DeleteCommentResultSchema = Schema.Struct({
  commentId: CommentId,
  issueIdentifier: IssueIdentifier,
  deleted: Schema.Boolean
})
export type DeleteCommentResult = Schema.Schema.Type<typeof DeleteCommentResultSchema>

export const ListCommentsResultSchema = Schema.Array(CommentSchema)
