import { Schema } from "effect"

import { DrawingContent } from "./domain-values.js"
import { toDraft07JsonSchema } from "./json-schema.js"
import {
  AttachmentId,
  DEFAULT_LIMIT,
  DocId,
  DrawingId,
  LimitParam,
  ObjectClassName,
  SavedAttachmentId,
  SpaceId,
  Timestamp
} from "./shared.js"
export const SavedAttachmentSchema = Schema.Struct({ id: SavedAttachmentId, attachmentId: AttachmentId })
export type SavedAttachment = Schema.Schema.Type<typeof SavedAttachmentSchema>
export const DrawingSchema = Schema.Struct({
  id: DrawingId,
  parentId: DocId,
  parentClass: ObjectClassName,
  content: Schema.optional(DrawingContent),
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
})
export type Drawing = Schema.Schema.Type<typeof DrawingSchema>

export const SaveAttachmentParamsSchema = Schema.Struct({
  attachmentId: AttachmentId.annotate({ description: "Attachment ID to save/bookmark." })
}).annotate({ title: "SaveAttachmentParams", description: "Parameters for saving/bookmarking an attachment." })

export type SaveAttachmentParams = Schema.Schema.Type<typeof SaveAttachmentParamsSchema>

export const UnsaveAttachmentParamsSchema = SaveAttachmentParamsSchema.annotate({
  title: "UnsaveAttachmentParams",
  description: "Parameters for removing an attachment from saved/bookmarks."
})

export type UnsaveAttachmentParams = Schema.Schema.Type<typeof UnsaveAttachmentParamsSchema>

export const ListSavedAttachmentsParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of saved attachments to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({
  title: "ListSavedAttachmentsParams",
  description: "Parameters for listing saved/bookmarked attachments."
})

export type ListSavedAttachmentsParams = Schema.Schema.Type<typeof ListSavedAttachmentsParamsSchema>

export const ListDrawingsParamsSchema = Schema.Struct({
  parentId: DocId.annotate({ description: "Internal Huly parent object ID." }),
  parentClass: ObjectClassName.annotate({ description: "Internal Huly parent object class." }),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of drawings to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({
  title: "ListDrawingsParams",
  description: "Parameters for listing drawings attached to a parent object."
})

export type ListDrawingsParams = Schema.Schema.Type<typeof ListDrawingsParamsSchema>

export const GetDrawingParamsSchema = Schema.Struct({
  drawingId: DrawingId.annotate({ description: "Drawing ID." })
}).annotate({ title: "GetDrawingParams", description: "Parameters for retrieving a drawing." })

export type GetDrawingParams = Schema.Schema.Type<typeof GetDrawingParamsSchema>

export const CreateDrawingParamsSchema = Schema.Struct({
  parentId: DocId.annotate({ description: "Internal Huly parent object ID." }),
  parentClass: ObjectClassName.annotate({ description: "Internal Huly parent object class." }),
  space: SpaceId.annotate({ description: "Space ID where the drawing should be created." }),
  content: Schema.optional(DrawingContent)
}).annotate({ title: "CreateDrawingParams", description: "Parameters for creating a drawing under a Huly object." })

export type CreateDrawingParams = Schema.Schema.Type<typeof CreateDrawingParamsSchema>

export const UpdateDrawingParamsSchema = Schema.Struct({
  drawingId: DrawingId.annotate({ description: "Drawing ID." }),
  content: Schema.NullOr(DrawingContent).annotate({ description: "New drawing content payload. Use null to clear." })
}).annotate({ title: "UpdateDrawingParams", description: "Parameters for updating drawing content." })

export type UpdateDrawingParams = Schema.Schema.Type<typeof UpdateDrawingParamsSchema>

export const DeleteDrawingParamsSchema = Schema.Struct({
  drawingId: DrawingId.annotate({ description: "Drawing ID to delete." })
}).annotate({ title: "DeleteDrawingParams", description: "Parameters for deleting a drawing." })

export type DeleteDrawingParams = Schema.Schema.Type<typeof DeleteDrawingParamsSchema>

export const saveAttachmentParamsJsonSchema = toDraft07JsonSchema(SaveAttachmentParamsSchema)
export const unsaveAttachmentParamsJsonSchema = toDraft07JsonSchema(UnsaveAttachmentParamsSchema)
export const listSavedAttachmentsParamsJsonSchema = toDraft07JsonSchema(ListSavedAttachmentsParamsSchema)
export const listDrawingsParamsJsonSchema = toDraft07JsonSchema(ListDrawingsParamsSchema)
export const getDrawingParamsJsonSchema = toDraft07JsonSchema(GetDrawingParamsSchema)
export const createDrawingParamsJsonSchema = toDraft07JsonSchema(CreateDrawingParamsSchema)
export const updateDrawingParamsJsonSchema = toDraft07JsonSchema(UpdateDrawingParamsSchema)
export const deleteDrawingParamsJsonSchema = toDraft07JsonSchema(DeleteDrawingParamsSchema)

export const parseSaveAttachmentParams = Schema.decodeUnknownEffect(SaveAttachmentParamsSchema)
export const parseUnsaveAttachmentParams = Schema.decodeUnknownEffect(UnsaveAttachmentParamsSchema)
export const parseListSavedAttachmentsParams = Schema.decodeUnknownEffect(ListSavedAttachmentsParamsSchema)
export const parseListDrawingsParams = Schema.decodeUnknownEffect(ListDrawingsParamsSchema)
export const parseGetDrawingParams = Schema.decodeUnknownEffect(GetDrawingParamsSchema)
export const parseCreateDrawingParams = Schema.decodeUnknownEffect(CreateDrawingParamsSchema)
export const parseUpdateDrawingParams = Schema.decodeUnknownEffect(UpdateDrawingParamsSchema)
export const parseDeleteDrawingParams = Schema.decodeUnknownEffect(DeleteDrawingParamsSchema)

export const SavedAttachmentWireSchema = Schema.Struct({ id: SavedAttachmentId, attachmentId: AttachmentId })

export const DrawingWireSchema = Schema.Struct({
  id: DrawingId,
  parentId: DocId,
  parentClass: ObjectClassName,
  content: Schema.optional(DrawingContent),
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
})

export const SaveAttachmentResultSchema = Schema.Struct({
  savedId: SavedAttachmentId,
  attachmentId: AttachmentId,
  saved: Schema.Boolean
})
export type SaveAttachmentResult = Schema.Schema.Type<typeof SaveAttachmentResultSchema>

export const UnsaveAttachmentResultSchema = Schema.Struct({ attachmentId: AttachmentId, removed: Schema.Boolean })
export type UnsaveAttachmentResult = Schema.Schema.Type<typeof UnsaveAttachmentResultSchema>

export const CreateDrawingResultSchema = Schema.Struct({ drawingId: DrawingId })
export type CreateDrawingResult = Schema.Schema.Type<typeof CreateDrawingResultSchema>

export const UpdateDrawingResultSchema = Schema.Struct({ drawingId: DrawingId, updated: Schema.Boolean })
export type UpdateDrawingResult = Schema.Schema.Type<typeof UpdateDrawingResultSchema>

export const DeleteDrawingResultSchema = Schema.Struct({ drawingId: DrawingId, deleted: Schema.Boolean })
export type DeleteDrawingResult = Schema.Schema.Type<typeof DeleteDrawingResultSchema>

export const ListSavedAttachmentsResultSchema = Schema.Array(SavedAttachmentWireSchema)
export const ListDrawingsResultSchema = Schema.Array(DrawingWireSchema)
export const GetDrawingResultSchema = DrawingWireSchema
