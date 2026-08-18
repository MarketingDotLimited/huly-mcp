import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { setTimeout as delay } from "node:timers/promises"

import { Clock, Effect, Schema } from "effect"

import { initializeRequest, MCP_PROTOCOL_VERSION, openMcpStdioClient, parseMcpResponse } from "./mcp-wire-client.js"

const ToolCallResultSchema = Schema.Struct({
  isError: Schema.optional(Schema.Boolean),
  structuredContent: Schema.optional(Schema.Unknown)
})
const InitializeResultSchema = Schema.Struct({
  protocolVersion: Schema.Literal(MCP_PROTOCOL_VERSION),
  serverInfo: Schema.Struct({ name: Schema.Literal("huly-mcp"), version: Schema.NonEmptyString })
})
const processArgumentOffset = 2
const [command, expectedVersion] = Schema.decodeUnknownSync(
  Schema.Tuple([Schema.NonEmptyString, Schema.NonEmptyString])
)(process.argv.slice(processArgumentOffset))
const interruptedExitCode = 130
const HTTP_OK_STATUS = 200
const HTTP_ACCEPTED_STATUS = 202
const HTTP_STOP_TIMEOUT_MILLISECONDS = 2_000
const HTTP_STARTUP_TIMEOUT_MILLISECONDS = 15_000
const HTTP_POLL_INTERVAL_MILLISECONDS = 100
const successfulCallRequestId = 2
const invalidCallRequestId = 3
const meta = {
  capabilities: {},
  clientInfo: { name: "packed-artifact-certification", version: "1.0.0" },
  protocolVersion: MCP_PROTOCOL_VERSION
}
const requestValue = (
  id: number,
  method: string,
  params: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> => ({ id, jsonrpc: "2.0", method, params })

const initialize = (): string => JSON.stringify(initializeRequest(meta.clientInfo.name))
const initialized = (): string => JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })

const runEofExchange = async (): Promise<void> => {
  let stderr = ""
  const client = await openMcpStdioClient(
    { args: [], command, env: { ...process.env, LAZY_ENVS: "true" }, onStderr: (text) => (stderr += text) },
    meta.clientInfo.name
  )
  try {
    const discovery = Schema.decodeUnknownSync(InitializeResultSchema)(client.initialize)
    const successfulResponse = await client.request(
      requestValue(successfulCallRequestId, "tools/call", { arguments: {}, name: "get_huly_context" })
    )
    const successfulCall = Schema.decodeUnknownSync(ToolCallResultSchema)(successfulResponse.result)
    const invalidCall = Schema.decodeUnknownSync(ToolCallResultSchema)(
      (await client.request(requestValue(invalidCallRequestId, "tools/call", { arguments: {}, name: "get_issue" })))
        .result
    )
    if (stderr.includes("FiberFailure")) throw new Error("Packed MCP stderr exposed FiberFailure internals.")
    if (successfulCall.isError === true || successfulCall.structuredContent === undefined) {
      throw new Error("Packed MCP get_huly_context call did not return a structured success.")
    }
    if (invalidCall.isError !== true) throw new Error("Packed MCP invalid get_issue call did not return a tool error.")
    if (discovery.serverInfo.version !== expectedVersion) {
      throw new Error("Packed MCP initialize version does not match the package manifest.")
    }
  } finally {
    await client.close()
  }
  const exit = await client.exit
  if (exit.code !== 0 || exit.signal !== null) throw new Error(`Packed MCP EOF exit was ${JSON.stringify(exit)}.`)
}

const runSignalShutdown = async (): Promise<void> => {
  const child = spawn(command, [], { env: { ...process.env, LAZY_ENVS: "true" }, stdio: ["pipe", "pipe", "pipe"] })
  let stderr = ""
  let stdout = ""
  const discovered = new Promise<void>((resolve) => {
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk
      if (stdout.includes("\n")) resolve()
    })
  })
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk
  })
  const exited = new Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      child.once("error", reject)
      child.once("close", (code, signal) => resolve({ code, signal }))
    }
  )
  child.stdin.write(`${initialize()}\n`)
  await discovered
  child.kill("SIGTERM")
  const exit = await exited
  if (exit.code !== interruptedExitCode || exit.signal !== null) {
    throw new Error(`Packed MCP signal exit was ${JSON.stringify(exit)}.`)
  }
  if (stderr.includes("FiberFailure")) throw new Error("Packed MCP signal stderr exposed FiberFailure internals.")
}

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("Packed MCP could not allocate an HTTP port.")))
        return
      }
      server.close((error) => (error === undefined ? resolve(address.port) : reject(error)))
    })
  })

const stopHttpProcess = async (child: ReturnType<typeof spawn>): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill("SIGTERM")
  await Promise.race([
    new Promise<void>((resolve) => child.once("close", () => resolve())),
    delay(HTTP_STOP_TIMEOUT_MILLISECONDS).then(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
    })
  ])
}

const httpPost = async (
  endpoint: string,
  body: Readonly<Record<string, unknown>>,
  sessionId?: string,
  protocolVersion = MCP_PROTOCOL_VERSION
): Promise<{
  readonly body: ReturnType<typeof parseMcpResponse>
  readonly headers: Headers
  readonly status: number
}> => {
  const headers: Record<string, string> = {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "mcp-protocol-version": protocolVersion
  }
  if (sessionId !== undefined) headers["mcp-session-id"] = sessionId
  const response = await fetch(endpoint, { body: JSON.stringify(body), headers, method: "POST" })
  const text = await response.text()
  if (text.trim() === "") throw new Error(`Packed MCP HTTP response was empty (${response.status}).`)
  return { body: parseMcpResponse(text), headers: response.headers, status: response.status }
}

const waitForHttp = async (endpoint: string, child: ReturnType<typeof spawn>): Promise<void> => {
  const currentTimeMillis = (): Promise<number> => Effect.runPromise(Clock.currentTimeMillis)
  const deadline = (await currentTimeMillis()) + HTTP_STARTUP_TIMEOUT_MILLISECONDS
  while ((await currentTimeMillis()) < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("Packed MCP HTTP process exited early.")
    try {
      await fetch(endpoint)
      return
    } catch {
      await delay(HTTP_POLL_INTERVAL_MILLISECONDS)
    }
  }
  throw new Error("Packed MCP HTTP process did not become reachable.")
}

const runHttpExchange = async (): Promise<void> => {
  const port = await freePort()
  const endpoint = `http://127.0.0.1:${port}/mcp`
  const child = spawn(command, [], {
    env: {
      ...process.env,
      LAZY_ENVS: "true",
      MCP_HTTP_HOST: "127.0.0.1",
      MCP_HTTP_PORT: String(port),
      MCP_TRANSPORT: "http"
    },
    stdio: ["ignore", "pipe", "pipe"]
  })
  let stderr = ""
  child.stderr?.setEncoding("utf8")
  child.stderr?.on("data", (chunk: string) => (stderr += chunk))
  try {
    await waitForHttp(endpoint, child)
    const init = await httpPost(endpoint, initializeRequest(meta.clientInfo.name))
    if (init.status !== HTTP_OK_STATUS) throw new Error(`Packed MCP HTTP initialize returned ${init.status}.`)
    const initResult = Schema.decodeUnknownSync(InitializeResultSchema)(init.body.result)
    const sessionId = init.headers.get("mcp-session-id")
    if (sessionId === null || sessionId === "") throw new Error("Packed MCP HTTP initialize omitted Mcp-Session-Id.")
    const initializedResponse = await fetch(endpoint, {
      body: initialized(),
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": initResult.protocolVersion,
        "mcp-session-id": sessionId
      },
      method: "POST"
    })
    if (initializedResponse.status !== HTTP_ACCEPTED_STATUS && initializedResponse.status !== HTTP_OK_STATUS) {
      throw new Error(`Packed MCP HTTP initialized notification returned ${initializedResponse.status}.`)
    }
    const successfulCall = await httpPost(
      endpoint,
      requestValue(successfulCallRequestId, "tools/call", { arguments: {}, name: "get_huly_context" }),
      sessionId,
      initResult.protocolVersion
    )
    const invalidCall = await httpPost(
      endpoint,
      requestValue(invalidCallRequestId, "tools/call", { arguments: {}, name: "get_issue" }),
      sessionId,
      initResult.protocolVersion
    )
    const successfulResult = Schema.decodeUnknownSync(ToolCallResultSchema)(successfulCall.body.result)
    const invalidResult = Schema.decodeUnknownSync(ToolCallResultSchema)(invalidCall.body.result)
    if (successfulResult.isError === true || successfulResult.structuredContent === undefined) {
      throw new Error("Packed MCP HTTP get_huly_context call did not return a structured success.")
    }
    if (invalidResult.isError !== true)
      throw new Error("Packed MCP HTTP invalid get_issue call did not return a tool error.")
    if (stderr.includes("FiberFailure")) throw new Error("Packed MCP HTTP stderr exposed FiberFailure internals.")
  } finally {
    await stopHttpProcess(child)
  }
}

const main = async (): Promise<void> => {
  await runEofExchange()
  await runSignalShutdown()
  await runHttpExchange()
  process.stdout.write("Packed MCP initialize, calls, EOF, HTTP session, and signal shutdown verified.\n")
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
