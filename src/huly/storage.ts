/**
 * Storage client for file uploads to Huly.
 *
 * Provides Effect-based wrapper around @hcengineering/api-client StorageClient.
 *
 * @module
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Readable } from "node:stream"

import { type AuthOptions, type StorageClient } from "@hcengineering/api-client"
import type { Blob, Ref, WorkspaceUuid } from "@hcengineering/core"
import { Context, Effect, Layer, Schema } from "effect"

import { HulyConfigService } from "../config/config.js"
import { AttachmentByteSize } from "../domain/schemas/domain-values.js"
import { BlobId, NonEmptyString, UrlString } from "../domain/schemas/shared.js"
import { concatLink } from "../utils/url.js"
import { authToOptions, connectWithRetry } from "./client.js"
import {
  FileFetchError,
  FileNotFoundError,
  FileTooLargeError,
  FileUploadError,
  type HulyAuthError,
  type HulyConnectionError,
  HulyStorageConfigError,
  type HulyUnavailableError,
  InvalidContentTypeError,
  InvalidFileDataError,
  MAX_FILE_SIZE
} from "./errors.js"
import { toRef } from "./operations/sdk-boundary.js"
import { HulySdk, type HulySdkDependencies } from "./sdk-deps.js"
import { fetchFromUrl } from "./url-fetch.js"

const ALLOWED_CONTENT_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "image/tiff",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "text/markdown",
  "text/html",
  // Archives
  "application/zip",
  "application/x-tar",
  "application/gzip",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
  // Media
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  // Code/data
  "application/json",
  "application/xml",
  "text/xml",
  "application/javascript",
  // Generic
  "application/octet-stream"
])

export const validateFileSize = (buffer: Buffer, filename: string): Effect.Effect<void, FileTooLargeError> =>
  buffer.length > MAX_FILE_SIZE
    ? Effect.fail(new FileTooLargeError({ filename, size: buffer.length, maxSize: MAX_FILE_SIZE }))
    : Effect.void

export const validateContentType = (
  contentType: string,
  filename: string
): Effect.Effect<void, InvalidContentTypeError> =>
  ALLOWED_CONTENT_TYPES.has(contentType)
    ? Effect.void
    : Effect.fail(new InvalidContentTypeError({ filename, contentType }))

export type FileSourceParams =
  | { readonly _tag: "filePath"; readonly filePath: string }
  | { readonly _tag: "fileUrl"; readonly fileUrl: string }
  | { readonly _tag: "base64"; readonly data: string }

export const getBufferFromParams = (
  params: FileSourceParams
): Effect.Effect<Buffer, InvalidFileDataError | FileNotFoundError | FileFetchError> => {
  switch (params._tag) {
    case "filePath":
      return readFromFilePath(params.filePath)
    case "fileUrl":
      return fetchFromUrl(params.fileUrl)
    case "base64":
      return decodeBase64(params.data)
  }
}

export type StorageClientError =
  | HulyConnectionError
  | HulyUnavailableError
  | HulyAuthError
  | FileUploadError
  | HulyStorageConfigError
  | InvalidFileDataError
  | FileNotFoundError
  | FileFetchError

/**
 * Internal storage-adapter payload. This is not a serialized/tool boundary DTO:
 * downstream Huly operations need the SDK's Ref<Blob> type before mapping to
 * their own schema-owned MCP payloads.
 */
export interface UploadFileResult {
  /** The blob reference for attaching to documents */
  readonly blobId: Ref<Blob>
  /** Content type of the uploaded file */
  readonly contentType: string
  /** Size in bytes */
  readonly size: number
  /** URL to access the file */
  readonly url: string
}

/**
 * Operations exposed by the storage service.
 */
export interface HulyStorageOperations {
  /**
   * Upload a file to Huly storage.
   *
   * @param filename - Name of the file (used for blob ID generation)
   * @param data - File contents as Buffer
   * @param contentType - MIME type (e.g., "image/png")
   * @returns Upload result with blob ID and URL
   */
  readonly uploadFile: (
    filename: string,
    data: Buffer,
    contentType: string
  ) => Effect.Effect<UploadFileResult, StorageClientError>

  /**
   * Download a stored blob using the authenticated storage client.
   */
  readonly downloadFile?: (blobId: string) => Effect.Effect<Buffer, StorageClientError>

  /**
   * Download at most maxBytes from a stored blob, aborting the source stream
   * as soon as one byte beyond the limit is observed.
   */
  readonly downloadFileBounded?: (
    blobId: BlobId,
    maxBytes: AttachmentByteSize
  ) => Effect.Effect<Buffer, StorageClientError | FileTooLargeError>

  /**
   * Construct the URL for accessing a blob.
   *
   * @param blobId - The blob ID
   * @returns Full URL to access the file
   */
  readonly getFileUrl: (blobId: string) => string
}

export class HulyStorageClient extends Context.Service<HulyStorageClient, HulyStorageOperations>()(
  "@hulymcp/HulyStorageClient"
) {
  static readonly layerWithDependencies: Layer.Layer<
    HulyStorageClient,
    StorageClientError,
    HulyConfigService | HulySdk
  > = Layer.scoped(
    HulyStorageClient,
    Effect.gen(function* () {
      const config = yield* HulyConfigService
      const sdk = yield* HulySdk

      const authOptions = authToOptions(config.auth, config.workspace)

      const { filesUrlTemplate, storageClient } = yield* connectStorageClient(
        { url: UrlString.make(config.url), ...authOptions },
        sdk
      )

      const operations: HulyStorageOperations = {
        uploadFile: (filename, data, contentType) =>
          Effect.tryPromise({
            try: async () => {
              const blob = await storageClient.put(filename, data, contentType, data.length)
              return {
                blobId: blob._id,
                contentType: blob.contentType,
                size: blob.size,
                url: buildFileUrl(filesUrlTemplate, BlobId.make(blob._id))
              }
            },
            catch: (e) => new FileUploadError({ message: `File upload failed: ${String(e)}`, cause: e })
          }),

        downloadFile: (blobId) =>
          Effect.tryPromise({
            try: async () => streamToBuffer(await storageClient.get(blobId)),
            catch: (e) => new FileFetchError({ fileUrl: blobId, reason: String(e) })
          }),

        downloadFileBounded: (blobId, maxBytes) =>
          Effect.tryPromise({
            try: async () => streamToBoundedBuffer(await storageClient.get(blobId), maxBytes),
            catch: () => new FileFetchError({ fileUrl: blobId, reason: "storage adapter download failed" })
          }).pipe(
            Effect.flatMap((result) =>
              result._tag === "WithinLimit"
                ? Effect.succeed(result.bytes)
                : Effect.fail(new FileTooLargeError({ filename: blobId, size: result.observedSize, maxSize: maxBytes }))
            )
          ),

        getFileUrl: (blobId) => buildFileUrl(filesUrlTemplate, BlobId.make(blobId))
      }

      return operations
    })
  )

  static readonly layer: Layer.Layer<HulyStorageClient, StorageClientError, HulyConfigService> =
    HulyStorageClient.layerWithDependencies.pipe(Layer.provide(HulySdk.defaultLayer))

  /**
   * Create a test layer for unit testing.
   */
  static testLayer(mockOperations: Partial<HulyStorageOperations>): Layer.Layer<HulyStorageClient> {
    const noopUploadFile = (): Effect.Effect<UploadFileResult, StorageClientError> =>
      Effect.succeed({
        blobId: toRef<Blob>("test-blob-id"),
        contentType: "application/octet-stream",
        size: 0,
        url: "https://test.huly.io/files?workspace=test&file=test-blob-id"
      })

    const noopGetFileUrl = (blobId: string): string => `https://test.huly.io/files?workspace=test&file=${blobId}`
    const noopDownloadFile = (blobId: string): Effect.Effect<Buffer, StorageClientError> =>
      Effect.succeed(Buffer.from(`test file ${blobId}`))
    const downloadFile = mockOperations.downloadFile ?? noopDownloadFile
    const downloadFileBounded = mockOperations.downloadFileBounded ?? makeBufferedBoundedDownload(downloadFile)

    const defaultOps: HulyStorageOperations = {
      downloadFile,
      downloadFileBounded,
      uploadFile: noopUploadFile,
      getFileUrl: noopGetFileUrl
    }

    return Layer.succeed(HulyStorageClient, { ...defaultOps, ...mockOperations, downloadFile, downloadFileBounded })
  }
}

// --- Internal Helpers ---

const isErrnoException = (e: unknown): e is NodeJS.ErrnoException => e instanceof Error && "code" in e

const ConfiguredStorageUrl = NonEmptyString.pipe(Schema.brand("ConfiguredStorageUrl"))
type ConfiguredStorageUrl = Schema.Schema.Type<typeof ConfiguredStorageUrl>
const ResolvedStorageUrl = NonEmptyString.pipe(Schema.brand("ResolvedStorageUrl"))
type ResolvedStorageUrl = Schema.Schema.Type<typeof ResolvedStorageUrl>
const StorageFileUrlTemplate = NonEmptyString.pipe(Schema.brand("StorageFileUrlTemplate"))
type StorageFileUrlTemplate = Schema.Schema.Type<typeof StorageFileUrlTemplate>

const HulyStorageFilesConfigSchema = Schema.Struct({ FILES_URL: ConfiguredStorageUrl })
const HulyStorageUploadConfigSchema = Schema.Struct({ UPLOAD_URL: ConfiguredStorageUrl })
type HulyStorageFilesConfig = Schema.Schema.Type<typeof HulyStorageFilesConfigSchema>
type HulyStorageUploadConfig = Schema.Schema.Type<typeof HulyStorageUploadConfigSchema>
type HulyServerStorageConfig = HulyStorageFilesConfig & HulyStorageUploadConfig
const parseHulyServerStorageConfig = (input: unknown): Effect.Effect<HulyServerStorageConfig, HulyStorageConfigError> =>
  Effect.all([
    Schema.decodeUnknown(HulyStorageFilesConfigSchema)(input).pipe(
      Effect.mapError(() => new HulyStorageConfigError({ field: "FILES_URL" }))
    ),
    Schema.decodeUnknown(HulyStorageUploadConfigSchema)(input).pipe(
      Effect.mapError(() => new HulyStorageConfigError({ field: "UPLOAD_URL" }))
    )
  ]).pipe(Effect.map(([filesConfig, uploadConfig]) => ({ ...filesConfig, ...uploadConfig })))

const STORAGE_URL_PLACEHOLDER = { blobId: ":blobId", filename: ":filename", workspace: ":workspace" } as const
const STORAGE_FILE_PLACEHOLDERS = [STORAGE_URL_PLACEHOLDER.blobId, STORAGE_URL_PLACEHOLDER.filename] as const
const ENCODED_STORAGE_BLOB_PLACEHOLDER = encodeURIComponent(STORAGE_URL_PLACEHOLDER.blobId)

type StorageConnectionConfig = { url: UrlString } & AuthOptions

interface StorageConnection {
  storageClient: StorageClient
  filesUrlTemplate: StorageFileUrlTemplate
}

const buildFileUrl = (filesUrlTemplate: StorageFileUrlTemplate, blobId: BlobId): UrlString =>
  UrlString.make(
    filesUrlTemplate
      .replaceAll(STORAGE_URL_PLACEHOLDER.blobId, blobId)
      .replaceAll(STORAGE_URL_PLACEHOLDER.filename, blobId)
  )

const buildStorageFileTemplate = (filesUrl: ResolvedStorageUrl, workspaceId: WorkspaceUuid): StorageFileUrlTemplate => {
  const resolvedFilesUrl = filesUrl.replaceAll(STORAGE_URL_PLACEHOLDER.workspace, workspaceId)
  if (STORAGE_FILE_PLACEHOLDERS.some((placeholder) => resolvedFilesUrl.includes(placeholder))) {
    return StorageFileUrlTemplate.make(resolvedFilesUrl)
  }
  const params = new URLSearchParams({ workspace: workspaceId, file: STORAGE_URL_PLACEHOLDER.blobId })
  return StorageFileUrlTemplate.make(
    `${resolvedFilesUrl}?${params.toString().replace(ENCODED_STORAGE_BLOB_PLACEHOLDER, STORAGE_URL_PLACEHOLDER.blobId)}`
  )
}

const resolveServerUrl = (baseUrl: UrlString, configuredUrl: ConfiguredStorageUrl): ResolvedStorageUrl =>
  ResolvedStorageUrl.make(URL.canParse(configuredUrl) ? configuredUrl : concatLink(baseUrl, configuredUrl))

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Array<Buffer> = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

type BoundedStreamRead =
  | { readonly _tag: "WithinLimit"; readonly bytes: Buffer }
  | { readonly _tag: "LimitExceeded"; readonly observedSize: AttachmentByteSize }

const makeBufferedBoundedDownload =
  (
    downloadFile: NonNullable<HulyStorageOperations["downloadFile"]>
  ): NonNullable<HulyStorageOperations["downloadFileBounded"]> =>
  (blobId, maxBytes) =>
    downloadFile(blobId).pipe(
      Effect.flatMap((bytes) =>
        bytes.length <= maxBytes
          ? Effect.succeed(bytes)
          : Effect.fail(
              new FileTooLargeError({
                filename: blobId,
                size: AttachmentByteSize.make(maxBytes + 1),
                maxSize: maxBytes
              })
            )
      )
    )

const streamToBoundedBuffer = async (stream: Readable, maxBytes: AttachmentByteSize): Promise<BoundedStreamRead> => {
  const chunks: Array<Buffer> = []
  const retainedLimit = maxBytes + 1
  let retainedBytes = 0
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    const remaining = retainedLimit - retainedBytes
    const retained = bytes.subarray(0, remaining)
    chunks.push(retained)
    retainedBytes += retained.length
    if (retainedBytes > maxBytes) {
      stream.destroy()
      return { _tag: "LimitExceeded", observedSize: AttachmentByteSize.make(retainedBytes) }
    }
  }
  return { _tag: "WithinLimit", bytes: Buffer.concat(chunks, retainedBytes) }
}

const connectStorageClient = (
  config: StorageConnectionConfig,
  sdk: HulySdkDependencies
): Effect.Effect<StorageConnection, StorageClientError> =>
  Effect.gen(function* () {
    const { url, ...authOptions } = config
    const serverConfig = yield* connectWithRetry(() => sdk.loadServerConfig(url), url)
    const storageConfig = yield* parseHulyServerStorageConfig(serverConfig)
    const { token, workspaceId } = yield* connectWithRetry(
      () => sdk.getWorkspaceToken(url, authOptions, serverConfig),
      url
    )

    const filesUrl = resolveServerUrl(url, storageConfig.FILES_URL)
    const filesTemplate = buildStorageFileTemplate(filesUrl, workspaceId)
    const uploadUrl = ResolvedStorageUrl.make(
      resolveServerUrl(url, storageConfig.UPLOAD_URL).replaceAll(STORAGE_URL_PLACEHOLDER.workspace, workspaceId)
    )
    const storageClient: StorageClient = sdk.createStorageClient(filesTemplate, uploadUrl, token, workspaceId)

    return { filesUrlTemplate: filesTemplate, storageClient }
  })

/**
 * Decode base64 data to Buffer with validation.
 */
export const decodeBase64 = (base64Data: string): Effect.Effect<Buffer, InvalidFileDataError> =>
  Effect.try({
    try: () => {
      const dataUrlMatch = base64Data.match(
        /^data:(?:[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+)?(?:;[A-Za-z0-9!#$&^_.+-]+=[^,;\s]+)*;base64,(.+)$/s
      )
      if (base64Data.includes(",") && dataUrlMatch === null) {
        throw new Error("Malformed data URL")
      }

      const base64Clean = dataUrlMatch?.[1] ?? base64Data
      const normalizedInput = base64Clean.replace(/[\r\n\s]/g, "")

      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}(?:==)?|[A-Za-z0-9+/]{3}=?)?$/.test(normalizedInput)) {
        throw new Error("Invalid base64 encoding")
      }

      const buffer = Buffer.from(base64Clean, "base64")

      // Validate the buffer is not empty and is valid base64
      if (buffer.length === 0) {
        throw new Error("Empty buffer after decoding")
      }

      return buffer
    },
    catch: (e) => new InvalidFileDataError({ message: `Invalid base64 data: ${String(e)}` })
  })

/**
 * Read file from local filesystem.
 */
export const readFromFilePath = (filePath: string): Effect.Effect<Buffer, FileNotFoundError | InvalidFileDataError> =>
  Effect.tryPromise({
    try: () => fs.readFile(path.resolve(filePath)),
    catch: (e) => {
      if (isErrnoException(e) && e.code === "ENOENT") {
        return new FileNotFoundError({ filePath })
      }
      return new InvalidFileDataError({ message: `Failed to read file ${filePath}: ${String(e)}` })
    }
  })

export { fetchFromUrl, isBlockedUrl } from "./url-fetch.js"
