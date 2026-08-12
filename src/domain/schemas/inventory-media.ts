import { Schema } from "effect"

import { UPDATE_ATTACHMENT_FIELDS } from "./attachments.js"
import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "./document-native-references.js"
import { AttachmentDescription, AttachmentFileName, Base64FileData, LocalFilePath } from "./domain-values.js"
import {
  INVENTORY_MEDIA_FILE_SOURCE_FIELDS,
  inventoryMediaExactlyOneFileSourceMessage,
  inventoryMediaJsonSchema,
  withExactlyOneInventoryMediaFileSource
} from "./inventory-media-json-schema.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  AttachmentId,
  CommentId,
  DEFAULT_LIMIT,
  hasAtLeastOneDefined,
  InventoryCategoryIdentifier,
  InventoryProductIdentifier,
  LimitParam,
  MimeType,
  NonEmptyString,
  UrlString
} from "./shared.js"
import {
  UPLOAD_BASE64_DATA_DESCRIPTION,
  UPLOAD_FILE_PATH_DESCRIPTION,
  UPLOAD_FILE_URL_DESCRIPTION
} from "./upload-source.js"

const ProductLocatorFields = {
  product: InventoryProductIdentifier.annotate({
    description: "Inventory product ID or exact product name. Pass category when duplicate product names may exist."
  }),
  category: Schema.optional(
    InventoryCategoryIdentifier.annotate({
      description: "Optional category ID or exact category name used to disambiguate product names."
    })
  )
} as const

const MediaFileFields = {
  filename: AttachmentFileName.annotateKey({ description: "Name of the file to attach to the inventory product." }),
  contentType: MimeType.annotateKey({ description: "MIME type of the file, such as image/png or application/pdf." }),
  filePath: Schema.optional(LocalFilePath.annotateKey({ description: UPLOAD_FILE_PATH_DESCRIPTION })),
  fileUrl: Schema.optional(UrlString.annotateKey({ description: UPLOAD_FILE_URL_DESCRIPTION })),
  data: Schema.optional(Base64FileData.annotateKey({ description: UPLOAD_BASE64_DATA_DESCRIPTION })),
  description: Schema.optional(AttachmentDescription.annotateKey({ description: "Optional media description." })),
  pinned: Schema.optional(Schema.Boolean.annotateKey({ description: "Whether the media item should be pinned." }))
} as const

const requireExactlyOneFileSource = (params: {
  readonly filePath?: unknown
  readonly fileUrl?: unknown
  readonly data?: unknown
}) =>
  INVENTORY_MEDIA_FILE_SOURCE_FIELDS.filter((field) => params[field] !== undefined).length === 1 ||
  inventoryMediaExactlyOneFileSourceMessage

const ListInventoryProductAttachmentsParamsSchema = Schema.Struct({
  ...ProductLocatorFields,
  limit: Schema.optional(
    LimitParam.annotateKey({
      description: `Maximum number of product attachments to return (default: ${DEFAULT_LIMIT}).`
    })
  )
}).annotate({
  title: "ListInventoryProductAttachmentsParams",
  description: "Parameters for listing files attached directly to an inventory product."
})
export type ListInventoryProductAttachmentsParams = Schema.Schema.Type<
  typeof ListInventoryProductAttachmentsParamsSchema
>

const GetInventoryProductAttachmentParamsSchema = Schema.Struct({
  ...ProductLocatorFields,
  attachmentId: AttachmentId.annotateKey({ description: "Product attachment ID to retrieve." })
}).annotate({
  title: "GetInventoryProductAttachmentParams",
  description: "Parameters for retrieving one file attached directly to an inventory product."
})
export type GetInventoryProductAttachmentParams = Schema.Schema.Type<typeof GetInventoryProductAttachmentParamsSchema>

const AddInventoryProductAttachmentParamsSchema = Schema.Struct({ ...ProductLocatorFields, ...MediaFileFields })
  .pipe(Schema.check(Schema.makeFilter(requireExactlyOneFileSource)))
  .annotate({
    title: "AddInventoryProductAttachmentParams",
    description: `Parameters for adding a file to an inventory product. ${inventoryMediaExactlyOneFileSourceMessage}`
  })
export type AddInventoryProductAttachmentParams = Schema.Schema.Type<typeof AddInventoryProductAttachmentParamsSchema>

const UPDATE_INVENTORY_PRODUCT_MEDIA_FIELDS = UPDATE_ATTACHMENT_FIELDS

const UpdateInventoryProductAttachmentParamsSchema = Schema.Struct({
  ...ProductLocatorFields,
  attachmentId: AttachmentId.annotateKey({ description: "Product attachment ID to update." }),
  description: Schema.optional(
    Schema.NullOr(AttachmentDescription).annotateKey({ description: "New description; use null to clear it." })
  ),
  pinned: Schema.optional(Schema.Boolean.annotateKey({ description: "Pin or unpin the product attachment." }))
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_INVENTORY_PRODUCT_MEDIA_FIELDS)
          ? undefined
          : atLeastOneUpdateFieldMessage(UPDATE_INVENTORY_PRODUCT_MEDIA_FIELDS)
      )
    )
  )
  .annotate({
    title: "UpdateInventoryProductAttachmentParams",
    description: `Parameters for updating product attachment metadata. ${atLeastOneUpdateFieldMessage(
      UPDATE_INVENTORY_PRODUCT_MEDIA_FIELDS
    )}`
  })
export type UpdateInventoryProductAttachmentParams = Schema.Schema.Type<
  typeof UpdateInventoryProductAttachmentParamsSchema
>
assertUpdateFields<UpdateInventoryProductAttachmentParams>()(
  ["product", "category", "attachmentId"],
  UPDATE_INVENTORY_PRODUCT_MEDIA_FIELDS
)

const DeleteInventoryProductAttachmentParamsSchema = GetInventoryProductAttachmentParamsSchema.annotate({
  title: "DeleteInventoryProductAttachmentParams",
  description: "Parameters for permanently deleting a file attached directly to an inventory product."
})
export type DeleteInventoryProductAttachmentParams = Schema.Schema.Type<
  typeof DeleteInventoryProductAttachmentParamsSchema
>

const ListInventoryProductPhotosParamsSchema = Schema.Struct({
  ...ProductLocatorFields,
  limit: Schema.optional(
    LimitParam.annotateKey({ description: `Maximum number of product photos to return (default: ${DEFAULT_LIMIT}).` })
  )
}).annotate({
  title: "ListInventoryProductPhotosParams",
  description: "Parameters for listing photos attached directly to an inventory product."
})
export type ListInventoryProductPhotosParams = Schema.Schema.Type<typeof ListInventoryProductPhotosParamsSchema>

const GetInventoryProductPhotoParamsSchema = Schema.Struct({
  ...ProductLocatorFields,
  photoId: AttachmentId.annotateKey({ description: "Product photo ID to retrieve." })
}).annotate({
  title: "GetInventoryProductPhotoParams",
  description: "Parameters for retrieving one photo attached directly to an inventory product."
})
export type GetInventoryProductPhotoParams = Schema.Schema.Type<typeof GetInventoryProductPhotoParamsSchema>

const AddInventoryProductPhotoParamsSchema = Schema.Struct({ ...ProductLocatorFields, ...MediaFileFields })
  .pipe(Schema.check(Schema.makeFilter(requireExactlyOneFileSource)))
  .annotate({
    title: "AddInventoryProductPhotoParams",
    description: `Parameters for adding a photo to an inventory product. ${inventoryMediaExactlyOneFileSourceMessage}`
  })
export type AddInventoryProductPhotoParams = Schema.Schema.Type<typeof AddInventoryProductPhotoParamsSchema>

const UpdateInventoryProductPhotoParamsSchema = Schema.Struct({
  ...ProductLocatorFields,
  photoId: AttachmentId.annotateKey({ description: "Product photo ID to update." }),
  description: Schema.optional(
    Schema.NullOr(AttachmentDescription).annotateKey({ description: "New description; use null to clear it." })
  ),
  pinned: Schema.optional(Schema.Boolean.annotateKey({ description: "Pin or unpin the product photo." }))
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_INVENTORY_PRODUCT_MEDIA_FIELDS)
          ? undefined
          : atLeastOneUpdateFieldMessage(UPDATE_INVENTORY_PRODUCT_MEDIA_FIELDS)
      )
    )
  )
  .annotate({
    title: "UpdateInventoryProductPhotoParams",
    description: `Parameters for updating product photo metadata. ${atLeastOneUpdateFieldMessage(
      UPDATE_INVENTORY_PRODUCT_MEDIA_FIELDS
    )}`
  })
export type UpdateInventoryProductPhotoParams = Schema.Schema.Type<typeof UpdateInventoryProductPhotoParamsSchema>
assertUpdateFields<UpdateInventoryProductPhotoParams>()(
  ["product", "category", "photoId"],
  UPDATE_INVENTORY_PRODUCT_MEDIA_FIELDS
)

const DeleteInventoryProductPhotoParamsSchema = GetInventoryProductPhotoParamsSchema.annotate({
  title: "DeleteInventoryProductPhotoParams",
  description: "Parameters for permanently deleting a photo attached directly to an inventory product."
})
export type DeleteInventoryProductPhotoParams = Schema.Schema.Type<typeof DeleteInventoryProductPhotoParamsSchema>

const ListInventoryProductCommentsParamsSchema = Schema.Struct({
  ...ProductLocatorFields,
  limit: Schema.optional(
    LimitParam.annotateKey({ description: `Maximum number of product comments to return (default: ${DEFAULT_LIMIT}).` })
  )
}).annotate({
  title: "ListInventoryProductCommentsParams",
  description: "Parameters for listing comments attached directly to an inventory product."
})
export type ListInventoryProductCommentsParams = Schema.Schema.Type<typeof ListInventoryProductCommentsParamsSchema>

const AddInventoryProductCommentParamsSchema = Schema.Struct({
  ...ProductLocatorFields,
  body: NonEmptyString.annotateKey({ description: `Comment body in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}` })
}).annotate({
  title: "AddInventoryProductCommentParams",
  description: "Parameters for adding a comment to an inventory product."
})
export type AddInventoryProductCommentParams = Schema.Schema.Type<typeof AddInventoryProductCommentParamsSchema>

const UpdateInventoryProductCommentParamsSchema = Schema.Struct({
  ...ProductLocatorFields,
  commentId: CommentId.annotateKey({ description: "Product comment ID to update." }),
  body: NonEmptyString.annotate({
    description: `New comment body in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
  })
}).annotate({
  title: "UpdateInventoryProductCommentParams",
  description: "Parameters for updating an inventory product comment."
})
export type UpdateInventoryProductCommentParams = Schema.Schema.Type<typeof UpdateInventoryProductCommentParamsSchema>

const DeleteInventoryProductCommentParamsSchema = Schema.Struct({
  ...ProductLocatorFields,
  commentId: CommentId.annotateKey({ description: "Product comment ID to delete." })
}).annotate({
  title: "DeleteInventoryProductCommentParams",
  description: "Parameters for deleting an inventory product comment."
})
export type DeleteInventoryProductCommentParams = Schema.Schema.Type<typeof DeleteInventoryProductCommentParamsSchema>

const ListInventoryProductActivityParamsSchema = Schema.Struct({
  ...ProductLocatorFields,
  limit: Schema.optional(
    LimitParam.annotate({
      description: `Maximum number of product activity messages to return (default: ${DEFAULT_LIMIT}).`
    })
  )
}).annotate({
  title: "ListInventoryProductActivityParams",
  description: "Parameters for listing activity messages on an inventory product."
})
export type ListInventoryProductActivityParams = Schema.Schema.Type<typeof ListInventoryProductActivityParamsSchema>

export const listInventoryProductAttachmentsParamsJsonSchema = inventoryMediaJsonSchema(
  ListInventoryProductAttachmentsParamsSchema
)
export const getInventoryProductAttachmentParamsJsonSchema = inventoryMediaJsonSchema(
  GetInventoryProductAttachmentParamsSchema
)
export const addInventoryProductAttachmentParamsJsonSchema = withExactlyOneInventoryMediaFileSource(
  inventoryMediaJsonSchema(AddInventoryProductAttachmentParamsSchema)
)
export const updateInventoryProductAttachmentParamsJsonSchema = inventoryMediaJsonSchema(
  UpdateInventoryProductAttachmentParamsSchema
)
export const deleteInventoryProductAttachmentParamsJsonSchema = inventoryMediaJsonSchema(
  DeleteInventoryProductAttachmentParamsSchema
)
export const listInventoryProductPhotosParamsJsonSchema = inventoryMediaJsonSchema(
  ListInventoryProductPhotosParamsSchema
)
export const getInventoryProductPhotoParamsJsonSchema = inventoryMediaJsonSchema(GetInventoryProductPhotoParamsSchema)
export const addInventoryProductPhotoParamsJsonSchema = withExactlyOneInventoryMediaFileSource(
  inventoryMediaJsonSchema(AddInventoryProductPhotoParamsSchema)
)
export const updateInventoryProductPhotoParamsJsonSchema = inventoryMediaJsonSchema(
  UpdateInventoryProductPhotoParamsSchema
)
export const deleteInventoryProductPhotoParamsJsonSchema = inventoryMediaJsonSchema(
  DeleteInventoryProductPhotoParamsSchema
)
export const listInventoryProductCommentsParamsJsonSchema = inventoryMediaJsonSchema(
  ListInventoryProductCommentsParamsSchema
)
export const addInventoryProductCommentParamsJsonSchema = inventoryMediaJsonSchema(
  AddInventoryProductCommentParamsSchema
)
export const updateInventoryProductCommentParamsJsonSchema = inventoryMediaJsonSchema(
  UpdateInventoryProductCommentParamsSchema
)
export const deleteInventoryProductCommentParamsJsonSchema = inventoryMediaJsonSchema(
  DeleteInventoryProductCommentParamsSchema
)
export const listInventoryProductActivityParamsJsonSchema = inventoryMediaJsonSchema(
  ListInventoryProductActivityParamsSchema
)

export const parseListInventoryProductAttachmentsParams = Schema.decodeUnknownEffect(
  ListInventoryProductAttachmentsParamsSchema
)
export const parseGetInventoryProductAttachmentParams = Schema.decodeUnknownEffect(
  GetInventoryProductAttachmentParamsSchema
)
export const parseAddInventoryProductAttachmentParams = Schema.decodeUnknownEffect(
  AddInventoryProductAttachmentParamsSchema
)
export const parseUpdateInventoryProductAttachmentParams = Schema.decodeUnknownEffect(
  UpdateInventoryProductAttachmentParamsSchema
)
export const parseDeleteInventoryProductAttachmentParams = Schema.decodeUnknownEffect(
  DeleteInventoryProductAttachmentParamsSchema
)
export const parseListInventoryProductPhotosParams = Schema.decodeUnknownEffect(ListInventoryProductPhotosParamsSchema)
export const parseGetInventoryProductPhotoParams = Schema.decodeUnknownEffect(GetInventoryProductPhotoParamsSchema)
export const parseAddInventoryProductPhotoParams = Schema.decodeUnknownEffect(AddInventoryProductPhotoParamsSchema)
export const parseUpdateInventoryProductPhotoParams = Schema.decodeUnknownEffect(
  UpdateInventoryProductPhotoParamsSchema
)
export const parseDeleteInventoryProductPhotoParams = Schema.decodeUnknownEffect(
  DeleteInventoryProductPhotoParamsSchema
)
export const parseListInventoryProductCommentsParams = Schema.decodeUnknownEffect(
  ListInventoryProductCommentsParamsSchema
)
export const parseAddInventoryProductCommentParams = Schema.decodeUnknownEffect(AddInventoryProductCommentParamsSchema)
export const parseUpdateInventoryProductCommentParams = Schema.decodeUnknownEffect(
  UpdateInventoryProductCommentParamsSchema
)
export const parseDeleteInventoryProductCommentParams = Schema.decodeUnknownEffect(
  DeleteInventoryProductCommentParamsSchema
)
export const parseListInventoryProductActivityParams = Schema.decodeUnknownEffect(
  ListInventoryProductActivityParamsSchema
)
