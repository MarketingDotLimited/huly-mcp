/**
 * Attachment domain operations for Huly MCP server.
 *
 * Provides typed operations for managing attachments on Huly entities (issues, documents, etc.).
 * Operations use HulyClient and HulyStorageClient services.
 *
 * @module
 */
import { type Class, type Doc, type Space } from "@hcengineering/core"
import { Effect, Result, Schema } from "effect"

import type {
  Attachment,
  AttachmentSummary,
  DeleteAttachmentParams,
  DeleteAttachmentResult,
  DownloadAttachmentParams,
  DownloadAttachmentResult,
  GetAttachmentParams,
  ListAttachmentsParams,
  PinAttachmentParams,
  PinAttachmentResult,
  ReadAttachmentContentParams,
  ReadAttachmentContentResult,
  SupportedAttachmentImageType,
  UpdateAttachmentParams,
  UpdateAttachmentResult
} from "../../domain/schemas/attachments.js"
import {
  CanonicalBase64ImageData,
  READ_ATTACHMENT_CONTENT_MAX_BYTES,
  SupportedAttachmentImageTypeSchema,
  UPDATE_ATTACHMENT_FIELDS
} from "../../domain/schemas/attachments.js"
import { AttachmentByteSize, AttachmentFileName } from "../../domain/schemas/domain-values.js"
import { AttachmentId, BlobId, MimeType, UrlString } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  AttachmentContentTooLargeError,
  AttachmentContentTypeUnsupportedError,
  AttachmentContentUnavailableError,
  type AttachmentNotFoundError,
  type NoUpdateFieldsError
} from "../errors.js"
import { HulyStorageClient } from "../storage.js"
import {
  findAttachmentForScope,
  getAttachmentForScope,
  listAttachmentsForScope,
  updateAttachmentForScope
} from "./attachments-shared.js"
import { toRef } from "./sdk-boundary.js"
import { requireUpdateFields } from "./update-guards.js"

import { attachment } from "../huly-plugins.js"

export { addAttachment, addDocumentAttachment, addIssueAttachment } from "./attachments-upload.js"

type ListAttachmentsError = HulyClientError

type GetAttachmentError = HulyClientError | AttachmentNotFoundError

type UpdateAttachmentError = HulyClientError | NoUpdateFieldsError | AttachmentNotFoundError

type DeleteAttachmentError = HulyClientError | AttachmentNotFoundError

type PinAttachmentError = HulyClientError | AttachmentNotFoundError

type DownloadAttachmentError = HulyClientError | AttachmentNotFoundError

type ReadAttachmentContentError =
  | HulyClientError
  | AttachmentNotFoundError
  | AttachmentContentTooLargeError
  | AttachmentContentTypeUnsupportedError
  | AttachmentContentUnavailableError

const StoredAttachmentContentSchema = Schema.Struct({
  _id: AttachmentId,
  file: BlobId,
  name: AttachmentFileName,
  type: MimeType,
  size: AttachmentByteSize
})

const parseStoredAttachmentContent = (attachmentId: ReadAttachmentContentParams["attachmentId"], input: unknown) =>
  Schema.decodeUnknownEffect(StoredAttachmentContentSchema)(input).pipe(
    Effect.mapError(
      () => new AttachmentContentUnavailableError({ attachmentId, reason: "stored attachment metadata is invalid" })
    )
  )

const parseSupportedImageType = (
  attachmentId: ReadAttachmentContentParams["attachmentId"],
  input: MimeType
): Effect.Effect<SupportedAttachmentImageType, AttachmentContentTypeUnsupportedError> => {
  const decoded = Schema.decodeUnknownResult(SupportedAttachmentImageTypeSchema)(input)
  return Result.isSuccess(decoded)
    ? Effect.succeed(decoded.success)
    : Effect.fail(new AttachmentContentTypeUnsupportedError({ attachmentId, contentType: input }))
}

// --- Operations ---

/**
 * List attachments on an object.
 * Results sorted by modifiedOn descending.
 */
export const listAttachments = (
  params: ListAttachmentsParams
): Effect.Effect<Array<AttachmentSummary>, ListAttachmentsError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient

    return yield* listAttachmentsForScope(
      client,
      {
        classRef: attachment.class.Attachment,
        attachedTo: toRef<Doc>(params.objectId),
        attachedToClass: toRef<Class<Doc<Space>>>(params.objectClass),
        collection: "attachments"
      },
      params.limit
    )
  })

/**
 * Get a single attachment with full details.
 */
export const getAttachment = (
  params: GetAttachmentParams
): Effect.Effect<Attachment, GetAttachmentError, HulyClient | HulyStorageClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const storageClient = yield* HulyStorageClient

    return yield* getAttachmentForScope(client, storageClient, params.attachmentId, {
      classRef: attachment.class.Attachment
    })
  })

/**
 * Update an attachment's metadata.
 */
export const updateAttachment = (
  params: UpdateAttachmentParams
): Effect.Effect<UpdateAttachmentResult, UpdateAttachmentError, HulyClient> =>
  Effect.gen(function* () {
    yield* requireUpdateFields("update_attachment", params, UPDATE_ATTACHMENT_FIELDS)

    const client = yield* HulyClient

    yield* updateAttachmentForScope(client, params.attachmentId, params, { classRef: attachment.class.Attachment })

    return { attachmentId: AttachmentId.make(params.attachmentId), updated: true }
  })

/**
 * Delete an attachment.
 */
export const deleteAttachment = (
  params: DeleteAttachmentParams
): Effect.Effect<DeleteAttachmentResult, DeleteAttachmentError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient

    const att = yield* findAttachmentForScope(client, params.attachmentId, { classRef: attachment.class.Attachment })

    yield* client.removeDoc(attachment.class.Attachment, att.space, att._id)

    return { attachmentId: AttachmentId.make(params.attachmentId), deleted: true }
  })

/**
 * Pin or unpin an attachment.
 */
export const pinAttachment = (
  params: PinAttachmentParams
): Effect.Effect<PinAttachmentResult, PinAttachmentError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient

    const att = yield* findAttachmentForScope(client, params.attachmentId, { classRef: attachment.class.Attachment })

    yield* client.updateDoc(attachment.class.Attachment, att.space, att._id, { pinned: params.pinned })

    return { attachmentId: AttachmentId.make(params.attachmentId), pinned: params.pinned }
  })

/**
 * Get download URL for an attachment.
 */
export const downloadAttachment = (
  params: DownloadAttachmentParams
): Effect.Effect<DownloadAttachmentResult, DownloadAttachmentError, HulyClient | HulyStorageClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const storageClient = yield* HulyStorageClient

    const att = yield* findAttachmentForScope(client, params.attachmentId, { classRef: attachment.class.Attachment })

    const url = storageClient.getFileUrl(att.file)

    return {
      attachmentId: AttachmentId.make(params.attachmentId),
      url: UrlString.make(url),
      name: AttachmentFileName.make(att.name),
      type: MimeType.make(att.type),
      size: AttachmentByteSize.make(att.size)
    }
  })

export const readAttachmentContent = (
  params: ReadAttachmentContentParams
): Effect.Effect<ReadAttachmentContentResult, ReadAttachmentContentError, HulyClient | HulyStorageClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const storageClient = yield* HulyStorageClient
    const attachmentDoc = yield* findAttachmentForScope(client, params.attachmentId, {
      classRef: attachment.class.Attachment
    })
    const stored = yield* parseStoredAttachmentContent(params.attachmentId, attachmentDoc)
    const imageType = yield* parseSupportedImageType(params.attachmentId, stored.type)

    if (stored.size > READ_ATTACHMENT_CONTENT_MAX_BYTES) {
      return yield* new AttachmentContentTooLargeError({
        attachmentId: params.attachmentId,
        size: stored.size,
        maxSize: READ_ATTACHMENT_CONTENT_MAX_BYTES
      })
    }

    const downloadFileBounded = storageClient.downloadFileBounded
    if (downloadFileBounded === undefined) {
      return yield* new AttachmentContentUnavailableError({
        attachmentId: params.attachmentId,
        reason: "bounded authenticated storage download is unavailable"
      })
    }
    const download = yield* Effect.result(
      downloadFileBounded(stored.file, AttachmentByteSize.make(READ_ATTACHMENT_CONTENT_MAX_BYTES))
    )
    if (Result.isFailure(download)) {
      yield* Effect.logWarning("Attachment inline image storage download failed").pipe(
        Effect.annotateLogs("attachmentId", params.attachmentId),
        Effect.annotateLogs("storageErrorTag", download.failure._tag)
      )
      return yield* download.failure._tag === "FileTooLargeError"
        ? new AttachmentContentTooLargeError({
            attachmentId: params.attachmentId,
            size: download.failure.size,
            maxSize: READ_ATTACHMENT_CONTENT_MAX_BYTES
          })
        : new AttachmentContentUnavailableError({
            attachmentId: params.attachmentId,
            reason: "authenticated storage download failed"
          })
    }
    const bytes = download.success

    if (bytes.length > READ_ATTACHMENT_CONTENT_MAX_BYTES) {
      return yield* new AttachmentContentTooLargeError({
        attachmentId: params.attachmentId,
        size: bytes.length,
        maxSize: READ_ATTACHMENT_CONTENT_MAX_BYTES
      })
    }
    if (bytes.length === 0) {
      return yield* new AttachmentContentUnavailableError({
        attachmentId: params.attachmentId,
        reason: "downloaded image data is empty"
      })
    }

    return {
      _tag: "ImageAttachmentContent",
      metadata: {
        attachmentId: stored._id,
        name: stored.name,
        type: imageType,
        size: AttachmentByteSize.make(bytes.length)
      },
      data: CanonicalBase64ImageData.make(bytes.toString("base64"))
    }
  })
