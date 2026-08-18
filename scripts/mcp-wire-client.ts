import { createInterface, type Interface } from "node:readline"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"

import { Schema } from "effect"

import { isJsonValue, type JsonValue } from "./effect4-oracle-canonical.js"

/** The only protocol adapter installed by Effect AI in this release. */
export const MCP_PROTOCOL_VERSION = "2025-06-18"
const LAST_ARRAY_INDEX = -1
const HTTP_OK_STATUS = 200
const HTTP_ACCEPTED_STATUS = 202

const JsonValueSchema = Schema.declare(isJsonValue)
const JsonRpcResponseSchema = Schema.Struct({
  error: Schema.optionalKey(JsonValueSchema),
  id: Schema.Union([Schema.String, Schema.Number, Schema.Null]),
  jsonrpc: Schema.Literal("2.0"),
  result: Schema.optionalKey(JsonValueSchema)
})
export type JsonRpcResponse = Schema.Schema.Type<typeof JsonRpcResponseSchema>

const InitializeResultSchema = Schema.Struct({
  protocolVersion: Schema.String,
  serverInfo: Schema.Struct({ name: Schema.String, version: Schema.String })
})
export type InitializeResult = Schema.Schema.Type<typeof InitializeResultSchema>

const ResponseId = Schema.Union([Schema.String, Schema.Number])
type ResponseId = Schema.Schema.Type<typeof ResponseId>

const responseId = (response: JsonRpcResponse): ResponseId => {
  if (response.id === null) throw new Error("MCP response did not contain a request id.")
  return response.id
}

/** Parse either Effect AI's JSON response or its optional SSE data framing. */
export const parseMcpResponse = (text: string): JsonRpcResponse => {
  const data = text
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s?/u, ""))
    .at(LAST_ARRAY_INDEX)
  const encoded = data ?? text.trim()
  if (encoded === "") throw new Error("MCP response body was empty.")
  return Schema.decodeUnknownSync(Schema.fromJsonString(JsonRpcResponseSchema))(encoded)
}

export const initializeRequest = (clientName: string, id = 1): Readonly<Record<string, unknown>> => ({
  id,
  jsonrpc: "2.0",
  method: "initialize",
  params: {
    capabilities: {},
    clientInfo: { name: clientName, version: "1.0.0" },
    protocolVersion: MCP_PROTOCOL_VERSION
  }
})

export const initializedNotification = (): Readonly<Record<string, unknown>> => ({
  jsonrpc: "2.0",
  method: "notifications/initialized",
  params: {}
})

const encodeRequest = (request: Readonly<Record<string, unknown>>): string => `${JSON.stringify(request)}\n`

export interface McpStdioClientOptions {
  readonly args?: ReadonlyArray<string>
  readonly command: string
  readonly env?: NodeJS.ProcessEnv
  readonly onStderr?: (text: string) => void
}

export interface McpStdioClient {
  readonly close: () => Promise<void>
  readonly exit: Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>
  readonly notify: (request: Readonly<Record<string, unknown>>) => Promise<void>
  readonly request: (request: Readonly<Record<string, unknown>>) => Promise<JsonRpcResponse>
  readonly initialize: InitializeResult
}

const initializeStdio = async (
  request: (value: Readonly<Record<string, unknown>>) => Promise<JsonRpcResponse>,
  clientName: string
): Promise<InitializeResult> => {
  const response = await request(initializeRequest(clientName))
  if (response.error !== undefined) throw new Error(`MCP initialize failed: ${JSON.stringify(response.error)}`)
  return Schema.decodeUnknownSync(InitializeResultSchema)(response.result)
}

/**
 * Drive a real Effect AI stdio server. Requests are serialized because MCP
 * clients must not consume a response belonging to another request.
 */
export const openMcpStdioClient = async (
  options: McpStdioClientOptions,
  clientName = "hulymcp-wire-client"
): Promise<McpStdioClient> => {
  const child: ChildProcessWithoutNullStreams = spawn(options.command, options.args ?? [], {
    env: options.env,
    stdio: ["pipe", "pipe", "pipe"]
  })
  const lines: Interface = createInterface({ input: child.stdout })
  let pending: {
    readonly reject: (error: Error) => void
    readonly resolve: (response: JsonRpcResponse) => void
  } | null = null
  let closed = false
  const childExit = new Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>((resolve) =>
    child.once("close", (code, signal) => resolve({ code, signal }))
  )
  const failPending = (error: Error): void => {
    const current = pending
    pending = null
    current?.reject(error)
  }
  lines.on("line", (line) => {
    if (line.trim() === "") return
    try {
      const response = parseMcpResponse(line)
      const current = pending
      pending = null
      current?.resolve(response)
    } catch (error) {
      failPending(error instanceof Error ? error : new Error(String(error)))
    }
  })
  child.stderr.on("data", (chunk: Buffer) => options.onStderr?.(chunk.toString("utf8")))
  child.on("error", (error) => failPending(error))
  child.on("close", (code, signal) => {
    closed = true
    failPending(new Error(`MCP stdio process exited (${signal ?? `code ${code ?? "unknown"}`}).`))
  })

  const request = (value: Readonly<Record<string, unknown>>): Promise<JsonRpcResponse> => {
    if (closed) return Promise.reject(new Error("MCP stdio process is closed."))
    if (pending !== null) return Promise.reject(new Error("MCP stdio client already has a request in flight."))
    return new Promise((resolve, reject) => {
      pending = { reject, resolve }
      child.stdin.write(encodeRequest(value), (error) => {
        if (error !== undefined && error !== null) failPending(error)
      })
    })
  }
  const notify = async (value: Readonly<Record<string, unknown>>): Promise<void> => {
    if (closed) throw new Error("MCP stdio process is closed.")
    await new Promise<void>((resolve, reject) => {
      child.stdin.write(encodeRequest(value), (error) =>
        error === undefined || error === null ? resolve() : reject(error)
      )
    })
  }
  const close = async (): Promise<void> => {
    if (closed) return
    lines.close()
    child.stdin.end()
    await childExit
  }
  try {
    const initialize = await initializeStdio(request, clientName)
    await notify(initializedNotification())
    return { close, exit: childExit, initialize, notify, request }
  } catch (error) {
    await close().catch(() => undefined)
    throw error
  }
}

export interface McpHttpClientOptions {
  readonly endpoint: string
  readonly headers?: Readonly<Record<string, string>>
}

export interface McpHttpResponse {
  readonly body: JsonRpcResponse | null
  readonly headers: Headers
  readonly status: number
}

export interface McpHttpClient {
  readonly close: () => Promise<void>
  readonly initialize: InitializeResult
  readonly protocolVersion: string
  readonly request: (request: Readonly<Record<string, unknown>>) => Promise<JsonRpcResponse>
  readonly requestWithResponse: (request: Readonly<Record<string, unknown>>) => Promise<McpHttpResponse>
  readonly sessionId: string
}

const responseFromFetch = async (response: Response): Promise<McpHttpResponse> => {
  const text = await response.text()
  return {
    body: text.trim() === "" ? null : parseMcpResponse(text),
    headers: response.headers,
    status: response.status
  }
}

/** Drive Effect AI's stateful Streamable HTTP contract without the MCP SDK. */
export const openMcpHttpClient = async (
  options: McpHttpClientOptions,
  clientName = "hulymcp-wire-client"
): Promise<McpHttpClient> => {
  const baseHeaders = {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    ...options.headers
  }
  let sessionId = ""
  let protocolVersion = MCP_PROTOCOL_VERSION
  const requestWithResponse = async (value: Readonly<Record<string, unknown>>): Promise<McpHttpResponse> => {
    const headers: Record<string, string> = { ...baseHeaders, "mcp-protocol-version": protocolVersion }
    if (sessionId !== "") headers["mcp-session-id"] = sessionId
    const response = await fetch(options.endpoint, { body: JSON.stringify(value), headers, method: "POST" })
    return responseFromFetch(response)
  }
  const initializeResponse = await requestWithResponse(initializeRequest(clientName))
  if (initializeResponse.status !== HTTP_OK_STATUS || initializeResponse.body === null) {
    throw new Error(`MCP HTTP initialize failed with status ${initializeResponse.status}.`)
  }
  const advertisedSessionId = initializeResponse.headers.get("mcp-session-id")
  if (advertisedSessionId === null || advertisedSessionId.trim() === "") {
    throw new Error("MCP HTTP initialize did not return Mcp-Session-Id.")
  }
  sessionId = advertisedSessionId
  const initialize = Schema.decodeUnknownSync(InitializeResultSchema)(initializeResponse.body.result)
  protocolVersion = initialize.protocolVersion
  const initializedResponse = await requestWithResponse(initializedNotification())
  if (initializedResponse.status !== HTTP_ACCEPTED_STATUS && initializedResponse.status !== HTTP_OK_STATUS) {
    throw new Error(`MCP HTTP initialized notification failed with status ${initializedResponse.status}.`)
  }
  const request = async (value: Readonly<Record<string, unknown>>): Promise<JsonRpcResponse> => {
    const response = await requestWithResponse(value)
    if (response.body === null) throw new Error(`MCP HTTP request returned status ${response.status} without a body.`)
    return response.body
  }
  return { close: async () => undefined, initialize, protocolVersion, request, requestWithResponse, sessionId }
}

export const responseRequestId = responseId

export const requestResult = (response: JsonRpcResponse): JsonValue | undefined => response.result
