import { Schema } from "effect"

import { CommentSchema } from "./comments.js"
import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "./document-native-references.js"
import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import {
  CardId,
  CardIdentifier,
  CardSpaceIdentifier,
  CommentId,
  Count,
  DEFAULT_LIMIT,
  LimitParam,
  NonEmptyString
} from "./shared.js"

const CardCommentTargetFields = {
  cardSpace: CardSpaceIdentifier.annotateKey({ description: "Card space name or ID" }),
  card: CardIdentifier.annotateKey({ description: "Card title or ID" })
} as const

export const ListCardCommentsParamsSchema = Schema.Struct({
  ...CardCommentTargetFields,
  limit: Schema.optional(
    LimitParam.annotateKey({ description: `Maximum number of comments to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({ title: "ListCardCommentsParams", description: "Parameters for listing comments on a card" })
export type ListCardCommentsParams = Schema.Schema.Type<typeof ListCardCommentsParamsSchema>

export const AddCardCommentParamsSchema = Schema.Struct({
  ...CardCommentTargetFields,
  body: NonEmptyString.annotateKey({ description: `Comment body in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}` })
}).annotate({ title: "AddCardCommentParams", description: "Parameters for adding a comment to a card" })
export type AddCardCommentParams = Schema.Schema.Type<typeof AddCardCommentParamsSchema>

export const UpdateCardCommentParamsSchema = Schema.Struct({
  ...CardCommentTargetFields,
  commentId: CommentId.annotateKey({ description: "Card comment ID to update" }),
  body: NonEmptyString.annotate({
    description: `New comment body in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
  })
}).annotate({ title: "UpdateCardCommentParams", description: "Parameters for updating a card comment" })
export type UpdateCardCommentParams = Schema.Schema.Type<typeof UpdateCardCommentParamsSchema>

export const DeleteCardCommentParamsSchema = Schema.Struct({
  ...CardCommentTargetFields,
  commentId: CommentId.annotateKey({ description: "Card comment ID to delete" })
}).annotate({ title: "DeleteCardCommentParams", description: "Parameters for deleting a card comment" })
export type DeleteCardCommentParams = Schema.Schema.Type<typeof DeleteCardCommentParamsSchema>

export const ListCardCommentsResultSchema = Schema.Struct({
  cardId: CardId,
  comments: Schema.Array(CommentSchema),
  total: Count
})
export type ListCardCommentsResult = Schema.Schema.Type<typeof ListCardCommentsResultSchema>

export const AddCardCommentResultSchema = Schema.Struct({ cardId: CardId, commentId: CommentId })
export type AddCardCommentResult = Schema.Schema.Type<typeof AddCardCommentResultSchema>

export const UpdateCardCommentResultSchema = Schema.Struct({
  cardId: CardId,
  commentId: CommentId,
  updated: Schema.Boolean
})
export type UpdateCardCommentResult = Schema.Schema.Type<typeof UpdateCardCommentResultSchema>

export const DeleteCardCommentResultSchema = Schema.Struct({
  cardId: CardId,
  commentId: CommentId,
  deleted: Schema.Literal(true)
})
export type DeleteCardCommentResult = Schema.Schema.Type<typeof DeleteCardCommentResultSchema>

const CARD_COMMENT_PARAM_DESCRIPTIONS = {
  cardSpace: "Card space name or ID",
  card: "Card title or ID",
  commentId: "Card comment ID",
  body: `Comment body in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`,
  limit: `Maximum number of comments to return (default: ${DEFAULT_LIMIT})`
} as const
const cardCommentParamsJsonSchema = (schema: Schema.Constraint): object =>
  withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(schema), CARD_COMMENT_PARAM_DESCRIPTIONS)
export const listCardCommentsParamsJsonSchema = cardCommentParamsJsonSchema(ListCardCommentsParamsSchema)
export const addCardCommentParamsJsonSchema = cardCommentParamsJsonSchema(AddCardCommentParamsSchema)
export const updateCardCommentParamsJsonSchema = cardCommentParamsJsonSchema(UpdateCardCommentParamsSchema)
export const deleteCardCommentParamsJsonSchema = cardCommentParamsJsonSchema(DeleteCardCommentParamsSchema)

export const parseListCardCommentsParams = Schema.decodeUnknownEffect(ListCardCommentsParamsSchema)
export const parseAddCardCommentParams = Schema.decodeUnknownEffect(AddCardCommentParamsSchema)
export const parseUpdateCardCommentParams = Schema.decodeUnknownEffect(UpdateCardCommentParamsSchema)
export const parseDeleteCardCommentParams = Schema.decodeUnknownEffect(DeleteCardCommentParamsSchema)
