import { JSONSchema, Schema } from "effect"

import { withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import { BlobId, MimeType, NonEmptyString } from "./shared.js"
import {
  UPLOAD_BASE64_DATA_DESCRIPTION,
  UPLOAD_FILE_PATH_DESCRIPTION,
  UPLOAD_FILE_URL_DESCRIPTION
} from "./upload-source.js"

const UploadFileParamsBase = Schema.Struct({
  filename: NonEmptyString.annotations({ description: "Name of the file (e.g., 'screenshot.png')" }),
  contentType: MimeType.annotations({ description: "MIME type of the file (e.g., 'image/png', 'application/pdf')" }),
  filePath: Schema.optional(Schema.String.annotations({ description: UPLOAD_FILE_PATH_DESCRIPTION })),
  fileUrl: Schema.optional(Schema.String.annotations({ description: UPLOAD_FILE_URL_DESCRIPTION })),
  data: Schema.optional(Schema.String.annotations({ description: UPLOAD_BASE64_DATA_DESCRIPTION }))
})

export const UploadFileParamsSchema = UploadFileParamsBase.pipe(
  Schema.filter((params) => {
    const hasSource = params.filePath || params.fileUrl || params.data
    return hasSource ? true : "Must provide filePath, fileUrl, or data"
  })
).annotations({
  title: "UploadFileParams",
  description:
    "Parameters for uploading a file. Provide filePath (MCP server-host file), fileUrl (server-fetched URL), or data (client-local base64)."
})

export type UploadFileParams = Schema.Schema.Type<typeof UploadFileParamsSchema>
export const UploadFileResultSchema = Schema.Struct({
  blobId: BlobId,
  contentType: Schema.String,
  size: Schema.Number,
  url: Schema.String
})
export type UploadFileResult = Schema.Schema.Type<typeof UploadFileResultSchema>

export const uploadFileParamsJsonSchema = withJsonSchemaPropertyDescriptions(JSONSchema.make(UploadFileParamsSchema), {
  filePath: UPLOAD_FILE_PATH_DESCRIPTION,
  fileUrl: UPLOAD_FILE_URL_DESCRIPTION,
  data: UPLOAD_BASE64_DATA_DESCRIPTION
})

export const parseUploadFileParams = Schema.decodeUnknown(UploadFileParamsSchema)
