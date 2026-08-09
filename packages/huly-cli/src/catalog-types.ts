export interface CliCommandSpec {
  readonly path: readonly [string, ...Array<string>]
  readonly positional: ReadonlyArray<string>
  readonly description: string
  readonly behavior?: CliCommandBehavior
}

interface CliCommandBehavior {
  readonly base64FileInput?: CliFileInputPolicy
  readonly confirmation?: CliConfirmationPolicy
  readonly fileInput?: CliFileInputPolicy
  readonly fileOutput?: CliFileOutputPolicy
  readonly uploadInput?: { readonly type: "huly-upload-source" }
}

interface CliConfirmationPolicy {
  readonly message: string
  readonly type: "requires-yes"
}

interface CliAttachmentFileOutputPolicy {
  readonly attachmentIdField: string
  readonly type: "attachment-download"
}

interface CliImageFileOutputPolicy {
  readonly type: "image-content"
}

type CliFileOutputPolicy = CliAttachmentFileOutputPolicy | CliImageFileOutputPolicy

interface CliFileInputPolicy {
  readonly fields: ReadonlyArray<string>
}
