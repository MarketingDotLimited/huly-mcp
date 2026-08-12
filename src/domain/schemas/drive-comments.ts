import { Schema } from "effect"

import { ActivityMessageWireSchema } from "./activity.js"
import { CommentSchema } from "./comments.js"
import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "./document-native-references.js"
import { DriveIdentifier, DriveItemId, DriveItemSummarySchema, DrivePath } from "./drive.js"
import { toDraft07JsonSchema } from "./json-schema.js"
import {
  CommentId,
  Count,
  DEFAULT_LIMIT,
  hasAtLeastOneDefined,
  hasMutuallyExclusiveFields,
  LimitParam,
  mutuallyExclusiveFieldsMessage,
  NonEmptyString,
  withAtLeastOneRequired,
  withMutuallyExclusiveFields
} from "./shared.js"

const DriveFileLocatorFields = {
  filePath: Schema.optional(
    DrivePath.annotate({
      description: "Exact Drive file path, such as '/Specs/API.md'. Mutually exclusive with fileId."
    })
  ),
  fileId: Schema.optional(
    DriveItemId.annotate({ description: "Exact Drive file id. Mutually exclusive with filePath." })
  )
} as const

const requireOneDriveFileLocator = (params: { readonly filePath?: unknown; readonly fileId?: unknown }) =>
  hasAtLeastOneDefined(params, ["filePath", "fileId"]) || "Provide filePath or fileId."

const requireExclusiveDriveFileLocator = (params: { readonly filePath?: unknown; readonly fileId?: unknown }) =>
  !hasMutuallyExclusiveFields(params, ["filePath", "fileId"]) || mutuallyExclusiveFieldsMessage(["filePath", "fileId"])

const DriveFileCommentTargetSchema = Schema.Struct({ drive: DriveIdentifier, ...DriveFileLocatorFields }).pipe(
  Schema.check(Schema.makeFilter(requireOneDriveFileLocator)),
  Schema.check(Schema.makeFilter(requireExclusiveDriveFileLocator))
)

export const ListDriveFileCommentsParamsSchema = Schema.Struct({
  drive: DriveIdentifier,
  ...DriveFileLocatorFields,
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of comments to return (default: ${DEFAULT_LIMIT}).` })
  )
}).pipe(
  Schema.check(Schema.makeFilter(requireOneDriveFileLocator)),
  Schema.check(Schema.makeFilter(requireExclusiveDriveFileLocator))
)
export type ListDriveFileCommentsParams = Schema.Schema.Type<typeof ListDriveFileCommentsParamsSchema>

export const AddDriveFileCommentParamsSchema = Schema.Struct({
  drive: DriveIdentifier,
  ...DriveFileLocatorFields,
  body: NonEmptyString.annotate({ description: `Comment body in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}` })
}).pipe(
  Schema.check(Schema.makeFilter(requireOneDriveFileLocator)),
  Schema.check(Schema.makeFilter(requireExclusiveDriveFileLocator))
)
export type AddDriveFileCommentParams = Schema.Schema.Type<typeof AddDriveFileCommentParamsSchema>

export const UpdateDriveFileCommentParamsSchema = Schema.Struct({
  drive: DriveIdentifier,
  ...DriveFileLocatorFields,
  commentId: CommentId.annotate({ description: "Drive file comment id to update." }),
  body: NonEmptyString.annotate({
    description: `New comment body in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
  })
}).pipe(
  Schema.check(Schema.makeFilter(requireOneDriveFileLocator)),
  Schema.check(Schema.makeFilter(requireExclusiveDriveFileLocator))
)
export type UpdateDriveFileCommentParams = Schema.Schema.Type<typeof UpdateDriveFileCommentParamsSchema>

export const DeleteDriveFileCommentParamsSchema = Schema.Struct({
  drive: DriveIdentifier,
  ...DriveFileLocatorFields,
  commentId: CommentId.annotate({ description: "Drive file comment id to permanently delete." })
}).pipe(
  Schema.check(Schema.makeFilter(requireOneDriveFileLocator)),
  Schema.check(Schema.makeFilter(requireExclusiveDriveFileLocator))
)
export type DeleteDriveFileCommentParams = Schema.Schema.Type<typeof DeleteDriveFileCommentParamsSchema>

export const ListDriveFileActivityParamsSchema = Schema.Struct({
  drive: DriveIdentifier,
  ...DriveFileLocatorFields,
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of activity messages to return (default: ${DEFAULT_LIMIT}).` })
  )
}).pipe(
  Schema.check(Schema.makeFilter(requireOneDriveFileLocator)),
  Schema.check(Schema.makeFilter(requireExclusiveDriveFileLocator))
)
export type ListDriveFileActivityParams = Schema.Schema.Type<typeof ListDriveFileActivityParamsSchema>

export const ListDriveFileCommentsResultSchema = Schema.Struct({
  file: DriveItemSummarySchema,
  comments: Schema.Array(CommentSchema),
  total: Count
})
export type ListDriveFileCommentsResult = Schema.Schema.Type<typeof ListDriveFileCommentsResultSchema>

export const AddDriveFileCommentResultSchema = Schema.Struct({ file: DriveItemSummarySchema, commentId: CommentId })
export type AddDriveFileCommentResult = Schema.Schema.Type<typeof AddDriveFileCommentResultSchema>

export const UpdateDriveFileCommentResultSchema = Schema.Struct({
  file: DriveItemSummarySchema,
  commentId: CommentId,
  updated: Schema.Boolean
})
export type UpdateDriveFileCommentResult = Schema.Schema.Type<typeof UpdateDriveFileCommentResultSchema>

export const DeleteDriveFileCommentResultSchema = Schema.Struct({
  file: DriveItemSummarySchema,
  commentId: CommentId,
  deleted: Schema.Boolean
})
export type DeleteDriveFileCommentResult = Schema.Schema.Type<typeof DeleteDriveFileCommentResultSchema>

export const ListDriveFileActivityResultSchema = Schema.Struct({
  file: DriveItemSummarySchema,
  activity: Schema.Array(ActivityMessageWireSchema),
  total: Count
})
export type ListDriveFileActivityResult = Schema.Schema.Type<typeof ListDriveFileActivityResultSchema>

export const listDriveFileCommentsParamsJsonSchema = withAtLeastOneRequired(
  withMutuallyExclusiveFields(toDraft07JsonSchema(ListDriveFileCommentsParamsSchema), ["filePath", "fileId"]),
  ["filePath", "fileId"]
)
export const addDriveFileCommentParamsJsonSchema = withAtLeastOneRequired(
  withMutuallyExclusiveFields(toDraft07JsonSchema(AddDriveFileCommentParamsSchema), ["filePath", "fileId"]),
  ["filePath", "fileId"]
)
export const updateDriveFileCommentParamsJsonSchema = withAtLeastOneRequired(
  withMutuallyExclusiveFields(toDraft07JsonSchema(UpdateDriveFileCommentParamsSchema), ["filePath", "fileId"]),
  ["filePath", "fileId"]
)
export const deleteDriveFileCommentParamsJsonSchema = withAtLeastOneRequired(
  withMutuallyExclusiveFields(toDraft07JsonSchema(DeleteDriveFileCommentParamsSchema), ["filePath", "fileId"]),
  ["filePath", "fileId"]
)
export const listDriveFileActivityParamsJsonSchema = withAtLeastOneRequired(
  withMutuallyExclusiveFields(toDraft07JsonSchema(ListDriveFileActivityParamsSchema), ["filePath", "fileId"]),
  ["filePath", "fileId"]
)

export const parseDriveFileCommentTarget = Schema.decodeUnknownEffect(DriveFileCommentTargetSchema)
export const parseListDriveFileCommentsParams = Schema.decodeUnknownEffect(ListDriveFileCommentsParamsSchema)
export const parseAddDriveFileCommentParams = Schema.decodeUnknownEffect(AddDriveFileCommentParamsSchema)
export const parseUpdateDriveFileCommentParams = Schema.decodeUnknownEffect(UpdateDriveFileCommentParamsSchema)
export const parseDeleteDriveFileCommentParams = Schema.decodeUnknownEffect(DeleteDriveFileCommentParamsSchema)
export const parseListDriveFileActivityParams = Schema.decodeUnknownEffect(ListDriveFileActivityParamsSchema)
