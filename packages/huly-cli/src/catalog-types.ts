export type CliOptionName = string
export type CliSchemaFieldName = string

export interface CliCommandSpec {
  readonly path: readonly [string, ...Array<string>]
  readonly positional: ReadonlyArray<CliSchemaFieldName>
  readonly description: string
  readonly behavior?: CliCommandBehavior
}

interface CliCommandBehavior {
  readonly base64FileInput?: CliFileInputPolicy
  readonly confirmation?: CliConfirmationPolicy
  readonly fileInput?: CliFileInputPolicy
  readonly fileOutput?: CliFileOutputPolicy
}

interface CliConfirmationPolicy {
  readonly message: string
  readonly type: "requires-yes"
}

interface CliAttachmentFileOutputPolicy {
  readonly attachmentIdField: CliSchemaFieldName
  readonly type: "attachment-download"
}

interface CliImageFileOutputPolicy {
  readonly type: "image-content"
}

type CliFileOutputPolicy = CliAttachmentFileOutputPolicy | CliImageFileOutputPolicy

interface CliFileInputPolicy {
  readonly fields: ReadonlyArray<CliSchemaFieldName>
}
