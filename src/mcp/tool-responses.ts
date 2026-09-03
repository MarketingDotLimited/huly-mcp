import { Schema } from "effect"

import { type McpImageContent, McpImageContentSchema } from "../domain/schemas/attachments.js"
import type { ToolWarning } from "../domain/schemas/tool-warnings.js"

export const McpErrorCode = { InvalidParams: -32602, InternalError: -32603 } as const
export type McpErrorCode = (typeof McpErrorCode)[keyof typeof McpErrorCode]

interface ErrorMetadata {
  errorCode: McpErrorCode
  errorTag?: string | undefined
  errorLayer?: string | undefined
}

type McpTextContent = { readonly type: "text"; readonly text: string }
export type { McpImageContent } from "../domain/schemas/attachments.js"
type McpTextContentList = [McpTextContent, ...Array<McpTextContent>]

export interface MachineReadableError {
  readonly code: number
  readonly name: string
  readonly layer: string
  readonly timestamp: string
  readonly requestId: string
}

interface McpToolResponseBase {
  readonly content: McpTextContentList
  readonly _meta?: ErrorMetadata
}

export interface McpToolSuccessResponse extends McpToolResponseBase {
  structuredContent?: {
    readonly result: unknown
    readonly warnings?: ReadonlyArray<ToolWarning>
    readonly error?: never
  }
  readonly imageContent?: McpImageContent
  readonly isError?: false
}

export interface McpToolErrorResponse extends McpToolResponseBase {
  readonly structuredContent?: {
    readonly error?: MachineReadableError
    readonly warnings?: ReadonlyArray<ToolWarning>
    readonly result?: never
  }
  readonly isError: true
}

export type McpToolResponse = McpToolSuccessResponse | McpToolErrorResponse

type McpWireImageContent = (typeof McpImageContentSchema)["Encoded"]
type McpWireSuccessResponse = {
  readonly content: [McpTextContent, ...Array<McpTextContent | McpWireImageContent>]
  readonly structuredContent?: { readonly result: unknown; readonly warnings?: ReadonlyArray<ToolWarning> }
  readonly isError?: false
}
type McpWireErrorResponse = Omit<McpToolErrorResponse, "_meta">
export type McpWireResponse = McpWireSuccessResponse | McpWireErrorResponse

export interface McpErrorResponseWithMeta extends McpToolErrorResponse {
  isError: true
  _meta: ErrorMetadata
}

const encodeJsonText = (value: unknown): string => {
  const text = JSON.stringify(value)
  return typeof text === "string" ? text : "null"
}

export const redactErrorText = (value: string): string =>
  value
    .replace(/Bearer\s+[^\s]+/giu, "Bearer [REDACTED]")
    .replace(/(password|token|secret|authorization)(=|:\s*|["']?\s*:\s*["']?)([^\s&"']+)/giu, "$1$2[REDACTED]")

const redactWarnings = (warnings: ReadonlyArray<ToolWarning>): ReadonlyArray<ToolWarning> =>
  warnings.map((w) => ({ ...w, message: redactErrorText(w.message) }))

export const createErrorResponse = (
  text: string,
  errorCode: McpErrorCode,
  errorTag?: string,
  warnings: ReadonlyArray<ToolWarning> = [],
  errorLayer?: string
): McpErrorResponseWithMeta => {
  const rw = redactWarnings(warnings)
  return {
    content: [
      { type: "text", text: redactErrorText(text) },
      ...(rw.length > 0 ? [{ type: "text" as const, text: encodeJsonText({ warnings: rw }) }] : [])
    ],
    isError: true,
    ...(rw.length > 0 ? { structuredContent: { warnings: rw } } : {}),
    _meta: { errorCode, errorTag, errorLayer }
  }
}

const createSuccessResponseBase = <T>(result: T, warnings: ReadonlyArray<ToolWarning> = []): McpToolSuccessResponse => {
  const rw = redactWarnings(warnings)
  return {
    content: [
      { type: "text", text: encodeJsonText(result) },
      ...(rw.length > 0 ? [{ type: "text" as const, text: encodeJsonText({ warnings: rw }) }] : [])
    ],
    structuredContent: rw.length > 0 ? { result, warnings: rw } : { result }
  }
}

export const createSuccessResponse = <T>(result: T, warnings: ReadonlyArray<ToolWarning> = []): McpToolResponse =>
  createSuccessResponseBase(result, warnings)

export const createImageSuccessResponse = <T>(
  result: T,
  imageContent: McpImageContent,
  warnings: ReadonlyArray<ToolWarning> = []
): McpToolResponse => ({ ...createSuccessResponseBase(result, warnings), imageContent })

const appendWarningContent = (
  content: McpTextContentList,
  warnings: ReadonlyArray<ToolWarning>,
  replaceExistingWarningBlock: boolean
): McpTextContentList => {
  const [first, ...remaining] = content
  const preserved = replaceExistingWarningBlock ? remaining.slice(0, remaining.length - 1) : remaining
  return [first, ...preserved, { type: "text", text: encodeJsonText({ warnings }) }]
}

export function appendToolWarnings(
  response: McpToolErrorResponse,
  warnings: ReadonlyArray<ToolWarning>
): McpToolErrorResponse
export function appendToolWarnings(
  response: McpToolSuccessResponse,
  warnings: ReadonlyArray<ToolWarning>
): McpToolSuccessResponse
export function appendToolWarnings(response: McpToolResponse, warnings: ReadonlyArray<ToolWarning>): McpToolResponse
export function appendToolWarnings(response: McpToolResponse, warnings: ReadonlyArray<ToolWarning>): McpToolResponse {
  if (warnings.length === 0) return response
  const rw = redactWarnings(warnings)
  if (response.structuredContent === undefined) {
    return { ...response, content: appendWarningContent(response.content, rw, false) }
  }
  const existingWarnings = response.structuredContent.warnings ?? []
  const combinedWarnings = [...existingWarnings, ...rw]

  const content = appendWarningContent(response.content, combinedWarnings, existingWarnings.length > 0)
  if (response.isError === true) {
    const errorResponse: McpToolResponse = {
      ...response,
      content,
      structuredContent: { ...response.structuredContent, warnings: combinedWarnings }
    }
    return errorResponse
  }

  const successResponse: McpToolResponse = {
    ...response,
    content,
    structuredContent: { ...response.structuredContent, warnings: combinedWarnings }
  }
  return successResponse
}

export const applyErrorEnvelope = (
  response: McpToolErrorResponse,
  requestId: string,
  timestamp: string
): McpToolErrorResponse => {
  const { errorCode = McpErrorCode.InternalError, errorLayer = "server", errorTag = "Error" } = response._meta ?? {}

  return {
    ...response,
    structuredContent: {
      ...(response.structuredContent ?? {}),
      error: { code: errorCode, name: errorTag, layer: errorLayer, timestamp, requestId }
    }
  }
}

export const createUnknownToolError = (toolName: string): McpErrorResponseWithMeta =>
  createErrorResponse(`Unknown tool: ${toolName}`, McpErrorCode.InvalidParams, "UnknownTool", [], "proxy")

export const SERVER_SHUTTING_DOWN_MESSAGE = "Huly MCP is shutting down; start a new connection before retrying"

export const createServerShuttingDownError = (): McpErrorResponseWithMeta =>
  createErrorResponse(SERVER_SHUTTING_DOWN_MESSAGE, McpErrorCode.InternalError, "ServerShuttingDown", [], "server")

export const createInvalidParamsError = (
  message: string,
  errorTag?: string,
  errorLayer?: string
): McpErrorResponseWithMeta => createErrorResponse(message, McpErrorCode.InvalidParams, errorTag, [], errorLayer)

export function toMcpResponse(response: McpToolErrorResponse): McpWireErrorResponse
export function toMcpResponse(response: McpToolSuccessResponse): McpWireSuccessResponse
export function toMcpResponse(response: McpToolResponse): McpWireResponse
export function toMcpResponse(response: McpToolResponse): McpWireResponse {
  return response.isError === true
    ? {
        content: response.content,
        isError: true,
        ...(response.structuredContent !== undefined ? { structuredContent: response.structuredContent } : {})
      }
    : {
        content:
          response.imageContent === undefined
            ? response.content
            : [...response.content, Schema.encodeSync(McpImageContentSchema)(response.imageContent)],
        ...(response.structuredContent === undefined ? {} : { structuredContent: response.structuredContent }),
        ...(response.isError === undefined ? {} : { isError: response.isError })
      }
}
