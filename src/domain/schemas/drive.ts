import { Schema } from "effect"

import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import {
  BlobId,
  Count,
  DEFAULT_INCLUDE_ARCHIVED,
  DEFAULT_LIMIT,
  DocId,
  hasAtLeastOneDefined,
  hasMutuallyExclusiveFields,
  LimitParam,
  MimeType,
  mutuallyExclusiveFieldsMessage,
  NonEmptyString,
  Timestamp,
  UrlString,
  withAtLeastOneRequired,
  withMutuallyExclusiveFields
} from "./shared.js"
import {
  UPLOAD_BASE64_DATA_DESCRIPTION,
  UPLOAD_FILE_PATH_DESCRIPTION,
  UPLOAD_FILE_URL_DESCRIPTION,
  UPLOAD_SOURCE_FIELD_DESCRIPTIONS
} from "./upload-source.js"

const limitDescription = (subject: string): string => `Maximum ${subject} to return (default: ${DEFAULT_LIMIT}).`
export const DEFAULT_DRIVE_PATH = "/"
export const DEFAULT_DRIVE_ITEM_KIND = "any"
export const DEFAULT_DRIVE_CREATE_PARENTS = true

export const DriveId = DocId.pipe(Schema.brand("DriveId"))
export type DriveId = Schema.Schema.Type<typeof DriveId>

export const DriveItemId = DocId.pipe(Schema.brand("DriveItemId"))
export type DriveItemId = Schema.Schema.Type<typeof DriveItemId>

export const DriveFileVersionId = DocId.pipe(Schema.brand("DriveFileVersionId"))
export type DriveFileVersionId = Schema.Schema.Type<typeof DriveFileVersionId>

export const DriveIdentifier = NonEmptyString.pipe(Schema.brand("DriveIdentifier")).annotate({
  description: "Exact Drive id or exact Drive name. Use list_drives first when unsure."
})
export type DriveIdentifier = Schema.Schema.Type<typeof DriveIdentifier>

export const DrivePath = NonEmptyString.pipe(Schema.brand("DrivePath")).annotate({
  description:
    "POSIX-like Drive path. Absolute paths such as '/Specs/API.md' are preferred; relative paths are normalized under '/'."
})
export type DrivePath = Schema.Schema.Type<typeof DrivePath>

export const DriveItemTitle = NonEmptyString.pipe(
  Schema.check(Schema.makeFilter((title) => !title.includes("/") || "Drive item titles cannot contain '/'.")),
  Schema.brand("DriveItemTitle")
).annotate({
  description: "New file or folder title. Do not include path separators; use move_drive_item to change folders."
})
export type DriveItemTitle = Schema.Schema.Type<typeof DriveItemTitle>

const DriveFileLocator = NonEmptyString.pipe(Schema.brand("DriveFileLocator")).annotate({
  description: "Drive file id or Drive file path."
})

const DriveRootItemId = "drive:ids:Root"

const isNonRootItemLocator = (params: {
  readonly path?: string | undefined
  readonly itemId?: string | undefined
}): boolean | string =>
  params.path !== "/" && params.itemId !== DriveRootItemId
    ? true
    : "The Drive root '/' is not a file or folder item and cannot be moved, renamed, or deleted."

const DriveVersionLocator = NonEmptyString.pipe(Schema.brand("DriveVersionLocator")).annotate({
  description: "Drive file version id or numeric version string such as '1'."
})

const DriveItemLocatorFields = {
  path: Schema.optional(DrivePath),
  itemId: Schema.optional(
    DriveItemId.annotate({ description: "Exact Drive folder or file id. Mutually exclusive with path." })
  )
} as const

const requireDriveItemLocator = (params: { readonly path?: unknown; readonly itemId?: unknown }) =>
  hasAtLeastOneDefined(params, ["path", "itemId"]) || "Provide path or itemId."

const requireExclusiveDriveItemLocator = (params: { readonly path?: unknown; readonly itemId?: unknown }) =>
  !hasMutuallyExclusiveFields(params, ["path", "itemId"]) || mutuallyExclusiveFieldsMessage(["path", "itemId"])

export const DriveItemKindSchema = Schema.Literals(["any", "folder", "file"])
export type DriveItemKind = Schema.Schema.Type<typeof DriveItemKindSchema>

export const DriveSummarySchema = Schema.Struct({
  id: DriveId,
  name: NonEmptyString,
  description: Schema.optional(Schema.String),
  archived: Schema.Boolean,
  private: Schema.Boolean,
  autoJoin: Schema.optional(Schema.Boolean),
  membersCount: Count,
  ownersCount: Count,
  url: UrlString
})
export type DriveSummary = Schema.Schema.Type<typeof DriveSummarySchema>

export const DriveItemSummarySchema = Schema.Struct({
  id: DriveItemId,
  driveId: DriveId,
  kind: Schema.Literals(["folder", "file"]),
  title: NonEmptyString,
  path: DrivePath,
  parentId: Schema.optional(DriveItemId),
  url: UrlString,
  currentVersionId: Schema.optional(DriveFileVersionId),
  version: Schema.optional(Count),
  size: Schema.optional(Count),
  contentType: Schema.optional(MimeType),
  downloadUrl: Schema.optional(UrlString)
})
export type DriveItemSummary = Schema.Schema.Type<typeof DriveItemSummarySchema>

export const DriveFileVersionSummarySchema = Schema.Struct({
  id: DriveFileVersionId,
  fileId: DriveItemId,
  version: Count,
  title: NonEmptyString,
  blobId: BlobId,
  size: Count,
  contentType: MimeType,
  lastModified: Timestamp,
  current: Schema.Boolean,
  downloadUrl: UrlString
})
export type DriveFileVersionSummary = Schema.Schema.Type<typeof DriveFileVersionSummarySchema>

export const ListDrivesResultSchema = Schema.Struct({ drives: Schema.Array(DriveSummarySchema), total: Count })
export type ListDrivesResult = Schema.Schema.Type<typeof ListDrivesResultSchema>

export const ListDriveItemsResultSchema = Schema.Struct({
  drive: DriveSummarySchema,
  path: DrivePath,
  items: Schema.Array(DriveItemSummarySchema),
  total: Count
})
export type ListDriveItemsResult = Schema.Schema.Type<typeof ListDriveItemsResultSchema>

export const CreateDriveFolderResultSchema = Schema.Struct({ folder: DriveItemSummarySchema, created: Schema.Boolean })
export type CreateDriveFolderResult = Schema.Schema.Type<typeof CreateDriveFolderResultSchema>

export const UploadDriveFileResultSchema = Schema.Struct({
  file: DriveItemSummarySchema,
  createdParents: Schema.Array(DriveItemSummarySchema),
  currentVersion: DriveFileVersionSummarySchema
})
export type UploadDriveFileResult = Schema.Schema.Type<typeof UploadDriveFileResultSchema>

export const UploadDriveFileVersionResultSchema = Schema.Struct({
  file: DriveItemSummarySchema,
  currentVersion: DriveFileVersionSummarySchema
})
export type UploadDriveFileVersionResult = Schema.Schema.Type<typeof UploadDriveFileVersionResultSchema>

export const ListDriveFileVersionsResultSchema = Schema.Struct({
  file: DriveItemSummarySchema,
  versions: Schema.Array(DriveFileVersionSummarySchema),
  total: Count
})
export type ListDriveFileVersionsResult = Schema.Schema.Type<typeof ListDriveFileVersionsResultSchema>

export const RestoreDriveFileVersionResultSchema = Schema.Struct({
  file: DriveItemSummarySchema,
  restoredVersion: DriveFileVersionSummarySchema,
  restored: Schema.Boolean
})
export type RestoreDriveFileVersionResult = Schema.Schema.Type<typeof RestoreDriveFileVersionResultSchema>

export const MoveDriveItemResultSchema = Schema.Struct({
  item: DriveItemSummarySchema,
  moved: Schema.Boolean,
  fromPath: DrivePath,
  toPath: DrivePath
})
export type MoveDriveItemResult = Schema.Schema.Type<typeof MoveDriveItemResultSchema>

export const RenameDriveItemResultSchema = Schema.Struct({
  item: DriveItemSummarySchema,
  renamed: Schema.Boolean,
  fromPath: DrivePath,
  toPath: DrivePath
})
export type RenameDriveItemResult = Schema.Schema.Type<typeof RenameDriveItemResultSchema>

export const DeleteDriveItemResultSchema = Schema.Struct({
  deletedItem: DriveItemSummarySchema,
  deletedVersions: Count,
  deleted: Schema.Boolean
})
export type DeleteDriveItemResult = Schema.Schema.Type<typeof DeleteDriveItemResultSchema>

export const ListDrivesParamsSchema = Schema.Struct({
  query: Schema.optional(
    NonEmptyString.annotate({ description: "Case-insensitive substring to filter Drive names after listing." })
  ),
  includeArchived: Schema.optional(
    Schema.Boolean.annotate({ description: `Include archived Drives. Defaults to ${DEFAULT_INCLUDE_ARCHIVED}.` })
  ),
  limit: Schema.optional(LimitParam.annotate({ description: limitDescription("drives") }))
})
export type ListDrivesParams = Schema.Schema.Type<typeof ListDrivesParamsSchema>

export const GetDriveParamsSchema = Schema.Struct({ drive: DriveIdentifier })
export type GetDriveParams = Schema.Schema.Type<typeof GetDriveParamsSchema>

export const ListDriveItemsParamsSchema = Schema.Struct({
  drive: DriveIdentifier,
  path: Schema.optional(DrivePath.annotate({ description: `Folder path to list. Defaults to ${DEFAULT_DRIVE_PATH}.` })),
  kind: Schema.optional(
    DriveItemKindSchema.annotate({
      description: `Filter returned children by kind. Defaults to ${DEFAULT_DRIVE_ITEM_KIND}.`
    })
  ),
  limit: Schema.optional(LimitParam.annotate({ description: limitDescription("drive items") }))
})
export type ListDriveItemsParams = Schema.Schema.Type<typeof ListDriveItemsParamsSchema>

export const GetDriveItemParamsSchema = Schema.Struct({ drive: DriveIdentifier, ...DriveItemLocatorFields }).pipe(
  Schema.check(Schema.makeFilter(requireDriveItemLocator)),
  Schema.check(Schema.makeFilter(requireExclusiveDriveItemLocator))
)
export type GetDriveItemParams = Schema.Schema.Type<typeof GetDriveItemParamsSchema>

export const CreateDriveFolderParamsSchema = Schema.Struct({
  drive: DriveIdentifier,
  path: DrivePath.annotate({ description: "Folder path to create. Missing parents are created, like mkdir -p." })
})
export type CreateDriveFolderParams = Schema.Schema.Type<typeof CreateDriveFolderParamsSchema>

const UploadSourceFields = {
  filePath: Schema.optional(Schema.String.annotate({ description: UPLOAD_FILE_PATH_DESCRIPTION })),
  fileUrl: Schema.optional(Schema.String.annotate({ description: UPLOAD_FILE_URL_DESCRIPTION })),
  data: Schema.optional(Schema.String.annotate({ description: UPLOAD_BASE64_DATA_DESCRIPTION }))
} as const

const hasExactlyOneUploadSource = (params: {
  readonly filePath?: string | undefined
  readonly fileUrl?: string | undefined
  readonly data?: string | undefined
}): boolean | string => {
  const count = [params.filePath, params.fileUrl, params.data].filter((value) => value !== undefined).length
  return count === 1 ? true : "Provide exactly one of filePath, fileUrl, or data."
}

export const UploadDriveFileParamsSchema = Schema.Struct({
  drive: DriveIdentifier,
  path: DrivePath.annotate({ description: "Full Drive file path including filename, for example '/Specs/API.md'." }),
  contentType: MimeType.annotate({
    description: "MIME type of the file, for example 'text/plain' or 'application/pdf'."
  }),
  createParents: Schema.optional(
    Schema.Boolean.annotate({
      description: `Create missing parent folders automatically. Defaults to ${DEFAULT_DRIVE_CREATE_PARENTS}.`
    })
  ),
  ...UploadSourceFields
}).pipe(Schema.check(Schema.makeFilter(hasExactlyOneUploadSource)))
export type UploadDriveFileParams = Schema.Schema.Type<typeof UploadDriveFileParamsSchema>

export const UploadDriveFileVersionParamsSchema = Schema.Struct({
  drive: DriveIdentifier,
  file: DriveFileLocator,
  contentType: MimeType.annotate({
    description: "MIME type of the new version, for example 'text/plain' or 'application/pdf'."
  }),
  ...UploadSourceFields
}).pipe(Schema.check(Schema.makeFilter(hasExactlyOneUploadSource)))
export type UploadDriveFileVersionParams = Schema.Schema.Type<typeof UploadDriveFileVersionParamsSchema>

export const ListDriveFileVersionsParamsSchema = Schema.Struct({ drive: DriveIdentifier, file: DriveFileLocator })
export type ListDriveFileVersionsParams = Schema.Schema.Type<typeof ListDriveFileVersionsParamsSchema>

export const RestoreDriveFileVersionParamsSchema = Schema.Struct({
  drive: DriveIdentifier,
  file: DriveFileLocator,
  version: DriveVersionLocator
})
export type RestoreDriveFileVersionParams = Schema.Schema.Type<typeof RestoreDriveFileVersionParamsSchema>

export const MoveDriveItemParamsSchema = Schema.Struct({
  drive: DriveIdentifier,
  ...DriveItemLocatorFields,
  targetFolderPath: DrivePath.annotate({
    description: "Existing destination folder path in the same Drive. The item keeps its current title."
  })
}).pipe(
  Schema.check(Schema.makeFilter(requireDriveItemLocator)),
  Schema.check(Schema.makeFilter(requireExclusiveDriveItemLocator)),
  Schema.check(Schema.makeFilter(isNonRootItemLocator))
)
export type MoveDriveItemParams = Schema.Schema.Type<typeof MoveDriveItemParamsSchema>

export const RenameDriveItemParamsSchema = Schema.Struct({
  drive: DriveIdentifier,
  ...DriveItemLocatorFields,
  title: DriveItemTitle
}).pipe(
  Schema.check(Schema.makeFilter(requireDriveItemLocator)),
  Schema.check(Schema.makeFilter(requireExclusiveDriveItemLocator)),
  Schema.check(Schema.makeFilter(isNonRootItemLocator))
)
export type RenameDriveItemParams = Schema.Schema.Type<typeof RenameDriveItemParamsSchema>

export const DeleteDriveItemParamsSchema = Schema.Struct({ drive: DriveIdentifier, ...DriveItemLocatorFields }).pipe(
  Schema.check(Schema.makeFilter(requireDriveItemLocator)),
  Schema.check(Schema.makeFilter(requireExclusiveDriveItemLocator)),
  Schema.check(Schema.makeFilter(isNonRootItemLocator))
)
export type DeleteDriveItemParams = Schema.Schema.Type<typeof DeleteDriveItemParamsSchema>

export const listDrivesParamsJsonSchema = toDraft07JsonSchema(ListDrivesParamsSchema)
export const getDriveParamsJsonSchema = toDraft07JsonSchema(GetDriveParamsSchema)
export const listDriveItemsParamsJsonSchema = toDraft07JsonSchema(ListDriveItemsParamsSchema)
export const getDriveItemParamsJsonSchema = withAtLeastOneRequired(
  withMutuallyExclusiveFields(toDraft07JsonSchema(GetDriveItemParamsSchema), ["path", "itemId"]),
  ["path", "itemId"]
)
export const createDriveFolderParamsJsonSchema = toDraft07JsonSchema(CreateDriveFolderParamsSchema)
export const uploadDriveFileParamsJsonSchema = {
  ...withJsonSchemaPropertyDescriptions(
    toDraft07JsonSchema(UploadDriveFileParamsSchema),
    UPLOAD_SOURCE_FIELD_DESCRIPTIONS
  ),
  oneOf: [{ required: ["filePath"] }, { required: ["fileUrl"] }, { required: ["data"] }]
}
export const uploadDriveFileVersionParamsJsonSchema = {
  ...withJsonSchemaPropertyDescriptions(
    toDraft07JsonSchema(UploadDriveFileVersionParamsSchema),
    UPLOAD_SOURCE_FIELD_DESCRIPTIONS
  ),
  oneOf: [{ required: ["filePath"] }, { required: ["fileUrl"] }, { required: ["data"] }]
}
export const listDriveFileVersionsParamsJsonSchema = toDraft07JsonSchema(ListDriveFileVersionsParamsSchema)
export const restoreDriveFileVersionParamsJsonSchema = toDraft07JsonSchema(RestoreDriveFileVersionParamsSchema)
export const moveDriveItemParamsJsonSchema = withAtLeastOneRequired(
  withMutuallyExclusiveFields(toDraft07JsonSchema(MoveDriveItemParamsSchema), ["path", "itemId"]),
  ["path", "itemId"]
)
export const renameDriveItemParamsJsonSchema = withAtLeastOneRequired(
  withMutuallyExclusiveFields(toDraft07JsonSchema(RenameDriveItemParamsSchema), ["path", "itemId"]),
  ["path", "itemId"]
)
export const deleteDriveItemParamsJsonSchema = withAtLeastOneRequired(
  withMutuallyExclusiveFields(toDraft07JsonSchema(DeleteDriveItemParamsSchema), ["path", "itemId"]),
  ["path", "itemId"]
)

export const parseListDrivesParams = Schema.decodeUnknownEffect(ListDrivesParamsSchema)
export const parseGetDriveParams = Schema.decodeUnknownEffect(GetDriveParamsSchema)
export const parseListDriveItemsParams = Schema.decodeUnknownEffect(ListDriveItemsParamsSchema)
export const parseGetDriveItemParams = Schema.decodeUnknownEffect(GetDriveItemParamsSchema)
export const parseCreateDriveFolderParams = Schema.decodeUnknownEffect(CreateDriveFolderParamsSchema)
export const parseUploadDriveFileParams = Schema.decodeUnknownEffect(UploadDriveFileParamsSchema)
export const parseUploadDriveFileVersionParams = Schema.decodeUnknownEffect(UploadDriveFileVersionParamsSchema)
export const parseListDriveFileVersionsParams = Schema.decodeUnknownEffect(ListDriveFileVersionsParamsSchema)
export const parseRestoreDriveFileVersionParams = Schema.decodeUnknownEffect(RestoreDriveFileVersionParamsSchema)
export const parseMoveDriveItemParams = Schema.decodeUnknownEffect(MoveDriveItemParamsSchema)
export const parseRenameDriveItemParams = Schema.decodeUnknownEffect(RenameDriveItemParamsSchema)
export const parseDeleteDriveItemParams = Schema.decodeUnknownEffect(DeleteDriveItemParamsSchema)
