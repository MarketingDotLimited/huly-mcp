import type { CliCommandSpec } from "./catalog-types.js"
import { fieldOptionDescription, type FieldSpec } from "./schema-fields.js"

const CLI_UPLOAD_FIELD_DESCRIPTIONS = {
  filePath: "Filesystem path read by the CLI process.",
  fileUrl: "Remote URL fetched from the CLI process network.",
  data: "Canonical RFC 4648 base64 file content; use --data-base64-file for local bytes."
} as const

type CliUploadFieldName = keyof typeof CLI_UPLOAD_FIELD_DESCRIPTIONS

const isCliUploadFieldName = (fieldName: string): fieldName is CliUploadFieldName =>
  Object.hasOwn(CLI_UPLOAD_FIELD_DESCRIPTIONS, fieldName)

export const cliFieldOptionDescription = (spec: CliCommandSpec, rootSchema: object, field: FieldSpec): string => {
  const isUpload = spec.behavior?.base64FileInput?.fields.includes("data") === true
  return isUpload && isCliUploadFieldName(field.fieldName)
    ? CLI_UPLOAD_FIELD_DESCRIPTIONS[field.fieldName]
    : fieldOptionDescription(rootSchema, field)
}
