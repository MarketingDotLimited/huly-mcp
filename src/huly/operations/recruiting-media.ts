import type { ActivityMessage as HulyActivityMessage } from "@hcengineering/activity"
import { SortingOrder } from "@hcengineering/core"
import { Effect } from "effect"

import type {
  AddRecruitingAttachmentResult,
  AddRecruitingCommentResult,
  DeleteRecruitingAttachmentResult,
  DeleteRecruitingCommentResult,
  GetRecruitingAttachmentResult,
  ListRecruitingActivityResult,
  ListRecruitingAttachmentsResult,
  ListRecruitingCommentsResult,
  UpdateRecruitingAttachmentResult,
  UpdateRecruitingCommentResult
} from "../../domain/schemas/recruiting-media-results.js"
import type {
  AddRecruitingAttachmentParams,
  AddRecruitingCommentParams,
  DeleteRecruitingAttachmentParams,
  DeleteRecruitingCommentParams,
  GetRecruitingAttachmentParams,
  ListRecruitingActivityParams,
  ListRecruitingAttachmentsParams,
  ListRecruitingCommentsParams,
  UpdateRecruitingAttachmentParams,
  UpdateRecruitingCommentParams
} from "../../domain/schemas/recruiting-media.js"
import type { AttachmentId } from "../../domain/schemas/shared.js"
import { Count } from "../../domain/schemas/shared.js"
import { HulyClient } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import type { HulyDomainError } from "../errors.js"
import {
  RecruitingAttachmentNotFoundError,
  RecruitingCommentNotFoundError,
  RecruitingMutationUnsupportedError
} from "../errors.js"
import { activity, attachment } from "../huly-plugins.js"
import { HulyStorageClient } from "../storage.js"
import { toActivityMessages } from "./activity-shared.js"
import {
  addAttachedComment,
  deleteAttachedComment,
  listAttachedCommentsPage,
  updateAttachedComment
} from "./attached-comments.js"
import {
  type AttachmentCollectionScope,
  findAttachmentForScope,
  getAttachmentForScope,
  listAttachmentPageForScope,
  updateAttachmentForScope
} from "./attachments-shared.js"
import { uploadAndAttach } from "./attachments-upload.js"
import { clampLimit, findResultTotal, hulyQuery } from "./query-helpers.js"
import { type RecruitingTargetCoordinates, resolveRecruitingTarget } from "./recruiting-targets.js"

const commentsTarget = (target: RecruitingTargetCoordinates) => ({
  client: target.client,
  space: target.space,
  attachedTo: target.objectId,
  attachedToClass: target.objectClass,
  collection: "comments"
})

const attachmentScope = (target: RecruitingTargetCoordinates): AttachmentCollectionScope => ({
  classRef: attachment.class.Attachment,
  attachedTo: target.objectId,
  attachedToClass: target.objectClass,
  collection: "attachments"
})

const scopedCommentNotFound = (
  target: RecruitingTargetCoordinates,
  commentId: DeleteRecruitingCommentParams["commentId"]
) => new RecruitingCommentNotFoundError({ target: target.display, commentId })

const scopedAttachmentNotFound = (target: RecruitingTargetCoordinates, attachmentId: AttachmentId) =>
  new RecruitingAttachmentNotFoundError({ target: target.display, attachmentId })

const removeRecruitingAttachment = (
  target: RecruitingTargetCoordinates,
  attachmentId: AttachmentId
): Effect.Effect<void, HulyDomainError> =>
  Effect.gen(function* () {
    const media = yield* findAttachmentForScope(target.client, attachmentId, attachmentScope(target)).pipe(
      Effect.catchTag("AttachmentNotFoundError", () => scopedAttachmentNotFound(target, attachmentId))
    )
    const removeCollection = target.client.removeCollection
    if (removeCollection === undefined) {
      return yield* new RecruitingMutationUnsupportedError({
        message: "Huly client does not support removeCollection; Recruiting attachment deletion is unavailable"
      })
    }
    yield* removeCollection(
      attachment.class.Attachment,
      media.space,
      media._id,
      target.objectId,
      target.objectClass,
      "attachments"
    )
  })

export const listRecruitingComments = (
  params: ListRecruitingCommentsParams
): Effect.Effect<ListRecruitingCommentsResult, HulyDomainError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const target = yield* resolveRecruitingTarget(client, params.target)
    const page = yield* listAttachedCommentsPage(commentsTarget(target), params.limit, "Recruiting")
    return { target: target.target, comments: page.comments, total: page.total }
  })

export const addRecruitingComment = (
  params: AddRecruitingCommentParams
): Effect.Effect<AddRecruitingCommentResult, HulyDomainError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const target = yield* resolveRecruitingTarget(client, params.target)
    const commentId = yield* addAttachedComment(commentsTarget(target), params.body)
    return { target: target.target, commentId }
  })

export const updateRecruitingComment = (
  params: UpdateRecruitingCommentParams
): Effect.Effect<UpdateRecruitingCommentResult, HulyDomainError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const target = yield* resolveRecruitingTarget(client, params.target)
    const updated = yield* updateAttachedComment(commentsTarget(target), params.commentId, params.body, () =>
      scopedCommentNotFound(target, params.commentId)
    )
    return { target: target.target, commentId: params.commentId, updated }
  })

export const deleteRecruitingComment = (
  params: DeleteRecruitingCommentParams
): Effect.Effect<DeleteRecruitingCommentResult, HulyDomainError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const target = yield* resolveRecruitingTarget(client, params.target)
    yield* deleteAttachedComment(commentsTarget(target), params.commentId, () =>
      scopedCommentNotFound(target, params.commentId)
    )
    return { target: target.target, commentId: params.commentId, deleted: true }
  })

export const listRecruitingAttachments = (
  params: ListRecruitingAttachmentsParams
): Effect.Effect<ListRecruitingAttachmentsResult, HulyDomainError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const target = yield* resolveRecruitingTarget(client, params.target)
    const page = yield* listAttachmentPageForScope(target.client, attachmentScope(target), params.limit)
    return { target: target.target, attachments: page.attachments, total: page.total }
  })

export const getRecruitingAttachment = (
  params: GetRecruitingAttachmentParams
): Effect.Effect<GetRecruitingAttachmentResult, HulyDomainError, HulyClient | HulyStorageClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const storageClient = yield* HulyStorageClient
    const target = yield* resolveRecruitingTarget(client, params.target)
    const attachmentResult = yield* getAttachmentForScope(
      target.client,
      storageClient,
      params.attachmentId,
      attachmentScope(target)
    ).pipe(Effect.catchTag("AttachmentNotFoundError", () => scopedAttachmentNotFound(target, params.attachmentId)))
    return { target: target.target, attachment: attachmentResult }
  })

export const addRecruitingAttachment = (
  params: AddRecruitingAttachmentParams
): Effect.Effect<AddRecruitingAttachmentResult, HulyDomainError, HulyClient | HulyStorageClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const target = yield* resolveRecruitingTarget(client, params.target)
    const result = yield* uploadAndAttach(params, {
      spaceRef: target.space,
      objectRef: target.objectId,
      objectClassRef: target.objectClass,
      attachmentClassRef: attachment.class.Attachment,
      collection: "attachments"
    })
    return { target: target.target, attachmentId: result.attachmentId, blobId: result.blobId, url: result.url }
  })

export const updateRecruitingAttachment = (
  params: UpdateRecruitingAttachmentParams
): Effect.Effect<UpdateRecruitingAttachmentResult, HulyDomainError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const target = yield* resolveRecruitingTarget(client, params.target)
    yield* updateAttachmentForScope(target.client, params.attachmentId, params, attachmentScope(target)).pipe(
      Effect.catchTag("AttachmentNotFoundError", () => scopedAttachmentNotFound(target, params.attachmentId))
    )
    return { target: target.target, attachmentId: params.attachmentId, updated: true }
  })

export const deleteRecruitingAttachment = (
  params: DeleteRecruitingAttachmentParams
): Effect.Effect<DeleteRecruitingAttachmentResult, HulyDomainError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const target = yield* resolveRecruitingTarget(client, params.target)
    yield* removeRecruitingAttachment(target, params.attachmentId)
    return { target: target.target, attachmentId: params.attachmentId, deleted: true }
  })

export const listRecruitingActivity = (
  params: ListRecruitingActivityParams
): Effect.Effect<ListRecruitingActivityResult, HulyDomainError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const target = yield* resolveRecruitingTarget(client, params.target)
    const messages = yield* target.client.findAll<HulyActivityMessage>(
      activity.class.ActivityMessage,
      hulyQuery<HulyActivityMessage>({ attachedTo: target.objectId, attachedToClass: target.objectClass }),
      { limit: clampLimit(params.limit), sort: { modifiedOn: SortingOrder.Descending }, total: true }
    )
    return {
      target: target.target,
      activity: yield* toActivityMessages(messages, target.client.markupUrlConfig, "list_recruiting_activity"),
      total: Count.make(findResultTotal(messages))
    }
  })
