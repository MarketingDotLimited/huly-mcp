import * as fs from "node:fs/promises"
import { spawn, type ChildProcess } from "node:child_process"
import { createServer } from "node:net"
import { setTimeout as delay } from "node:timers/promises"

import { Clock, Effect, Schema } from "effect"

import {
  type BundledProcesses,
  BundledProcessesSchema,
  type OracleJsonRpcRequest,
  type OracleJsonRpcResponse,
  OracleJsonRpcRequestSchema,
  OracleJsonRpcResponseSchema,
  JsonValueSchema,
  type OracleMethod,
  type OracleProcessResult
} from "./effect4-oracle-schema.js"
import { runOracleProcess } from "./effect4-oracle-process-runner.js"
import { initializeRequest, openMcpHttpClient, type JsonRpcResponse } from "./mcp-wire-client.js"

export const LIST_TOOLS_REQUEST_ID = 2
const LIST_RESOURCE_TEMPLATES_REQUEST_ID = 3
const MISSING_ARGUMENTS_REQUEST_ID = 4
const EXTRA_ARGUMENTS_REQUEST_ID = 5
const UNKNOWN_TOOL_REQUEST_ID = 6
const LIST_RESOURCES_REQUEST_ID = 7
const PACKAGE_VERSION_PLACEHOLDER = "<package-version>"
const SERVER_INFO_META_KEY = "io.modelcontextprotocol/serverInfo"
const STDIO_RESPONSE_COUNT = 7
const HTTP_STOP_TIMEOUT_MILLISECONDS = 2_000
const HTTP_STARTUP_TIMEOUT_MILLISECONDS = 15_000
const HTTP_POLL_INTERVAL_MILLISECONDS = 100
const PackageManifestSchema = Schema.Struct({ version: Schema.String })
const OracleJsonRpcNotificationSchema = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  method: Schema.String,
  params: Schema.Record(Schema.String, JsonValueSchema)
})
const OracleJsonRpcMessageSchema = Schema.Union([OracleJsonRpcResponseSchema, OracleJsonRpcNotificationSchema])

const request = (id: number, method: OracleMethod, params: Readonly<Record<string, unknown>>): OracleJsonRpcRequest =>
  Schema.decodeUnknownSync(OracleJsonRpcRequestSchema)({ id, jsonrpc: "2.0", method, params })

const stdioRequests = (): ReadonlyArray<OracleJsonRpcRequest> => [
  Schema.decodeUnknownSync(OracleJsonRpcRequestSchema)(initializeRequest("effect-migration-oracle")),
  request(LIST_TOOLS_REQUEST_ID, "tools/list", {}),
  request(LIST_RESOURCE_TEMPLATES_REQUEST_ID, "resources/templates/list", {}),
  request(MISSING_ARGUMENTS_REQUEST_ID, "tools/call", { name: "get_issue" }),
  request(EXTRA_ARGUMENTS_REQUEST_ID, "tools/call", { name: "get_version", arguments: { extra: true } }),
  request(UNKNOWN_TOOL_REQUEST_ID, "tools/call", { name: "not_a_huly_tool", arguments: {} }),
  request(LIST_RESOURCES_REQUEST_ID, "resources/list", {})
]

const isJsonRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const normalizeServerVersion = (response: OracleJsonRpcResponse): OracleJsonRpcResponse => {
  if (!isJsonRecord(response.result)) return response
  const directServerInfo = response.result.serverInfo
  if (isJsonRecord(directServerInfo) && typeof directServerInfo.version === "string") {
    return Schema.decodeUnknownSync(OracleJsonRpcResponseSchema)({
      ...response,
      result: { ...response.result, serverInfo: { ...directServerInfo, version: PACKAGE_VERSION_PLACEHOLDER } }
    })
  }
  const metadata = response.result._meta
  if (!isJsonRecord(metadata)) return response
  const serverInfo = metadata[SERVER_INFO_META_KEY]
  if (!isJsonRecord(serverInfo) || typeof serverInfo.version !== "string") return response
  return Schema.decodeUnknownSync(OracleJsonRpcResponseSchema)({
    ...response,
    result: {
      ...response.result,
      _meta: { ...metadata, [SERVER_INFO_META_KEY]: { ...serverInfo, version: PACKAGE_VERSION_PLACEHOLDER } }
    }
  })
}

export const decodeOracleStdioResponses = (stdout: string): ReadonlyArray<OracleJsonRpcResponse> =>
  stdout
    .trim()
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => Schema.decodeUnknownSync(Schema.fromJsonString(OracleJsonRpcMessageSchema))(line))
    .filter((message): message is OracleJsonRpcResponse => "id" in message)
    .map(normalizeServerVersion)

export const requireSuccessfulOracleProcess = (label: string, result: OracleProcessResult): OracleProcessResult => {
  if (result.exitCode !== 0 || result.stderr !== "") {
    throw new Error(`${label} failed with exit ${result.exitCode}: ${result.stderr}`)
  }
  return result
}

const captureStdioMode = async (mode: "native" | "proxy") => {
  const entries = stdioRequests()
  const initialize = entries[0]
  if (initialize === undefined) throw new Error("MCP oracle request list did not contain initialize.")
  const requests = entries.slice(1)
  const input = `${[initialize]
    .map((entry) => JSON.stringify(Schema.encodeSync(OracleJsonRpcRequestSchema)(entry)))
    .join("\n")}\n${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n${requests
    .map((entry) => JSON.stringify(Schema.encodeSync(OracleJsonRpcRequestSchema)(entry)))
    .join("\n")}\n`
  const result = await runOracleProcess(
    process.execPath,
    ["dist/index.cjs"],
    { HULY_TOOL_MODE: mode, LAZY_ENVS: "true", MCP_AUTO_EXIT: "true" },
    input,
    undefined,
    STDIO_RESPONSE_COUNT
  )
  return decodeOracleStdioResponses(requireSuccessfulOracleProcess(`Bundled ${mode} stdio oracle`, result).stdout)
}

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("Oracle could not allocate an HTTP port.")))
        return
      }
      server.close((error) => (error === undefined ? resolve(address.port) : reject(error)))
    })
  })

const closeHttpProcess = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill("SIGTERM")
  await Promise.race([
    new Promise<void>((resolve) => child.once("close", () => resolve())),
    delay(HTTP_STOP_TIMEOUT_MILLISECONDS).then(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
    })
  ])
}

const waitForHttpProcess = async (endpoint: string, child: ChildProcess): Promise<void> => {
  const currentTimeMillis = (): Promise<number> => Effect.runPromise(Clock.currentTimeMillis)
  const deadline = (await currentTimeMillis()) + HTTP_STARTUP_TIMEOUT_MILLISECONDS
  while ((await currentTimeMillis()) < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("Bundled MCP HTTP process exited early.")
    try {
      await fetch(endpoint, {
        body: "{}",
        headers: { accept: "application/json, text/event-stream", "content-type": "application/json" },
        method: "POST"
      })
      return
    } catch {
      await delay(HTTP_POLL_INTERVAL_MILLISECONDS)
    }
  }
  throw new Error("Bundled MCP HTTP process did not become reachable.")
}

const captureHttpMode = async (mode: "native" | "proxy"): Promise<ReadonlyArray<OracleJsonRpcResponse>> => {
  const port = await freePort()
  const child = spawn(process.execPath, ["dist/index.cjs"], {
    env: {
      HULY_TOOL_MODE: mode,
      LAZY_ENVS: "true",
      MCP_HTTP_HOST: "127.0.0.1",
      MCP_HTTP_PORT: String(port),
      MCP_TRANSPORT: "http"
    },
    stdio: ["ignore", "pipe", "pipe"]
  })
  child.stdout.resume()
  child.stderr.resume()
  try {
    const endpoint = `http://127.0.0.1:${port}/mcp`
    await waitForHttpProcess(endpoint, child)
    const client = await openMcpHttpClient({ endpoint }, "effect-migration-oracle")
    const initialize: JsonRpcResponse = { id: 1, jsonrpc: "2.0", result: client.initialize }
    const responses = [
      initialize,
      await client.request({ id: LIST_TOOLS_REQUEST_ID, jsonrpc: "2.0", method: "tools/list", params: {} }),
      await client.request({
        id: LIST_RESOURCE_TEMPLATES_REQUEST_ID,
        jsonrpc: "2.0",
        method: "resources/templates/list",
        params: {}
      }),
      await client.request({
        id: MISSING_ARGUMENTS_REQUEST_ID,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: "get_issue" }
      }),
      await client.request({
        id: EXTRA_ARGUMENTS_REQUEST_ID,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: { extra: true }, name: "get_version" }
      }),
      await client.request({
        id: UNKNOWN_TOOL_REQUEST_ID,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: {}, name: "not_a_huly_tool" }
      }),
      await client.request({ id: LIST_RESOURCES_REQUEST_ID, jsonrpc: "2.0", method: "resources/list", params: {} })
    ]
    await client.close()
    return responses.map((response) => Schema.decodeUnknownSync(OracleJsonRpcResponseSchema)(response))
  } finally {
    await closeHttpProcess(child)
  }
}

const normalizeCliVersion = (result: OracleProcessResult): OracleProcessResult => ({
  exitCode: result.exitCode,
  stderr: result.stderr,
  stdout: result.stdout.replace(/^Huly CLI [^\n]+/u, `Huly CLI ${PACKAGE_VERSION_PLACEHOLDER}`)
})

const captureCli = async () => {
  const baseEnv = { NO_COLOR: "1" }
  const commands = {
    rootHelp: ["--help"],
    groupHelp: ["issues", "--help"],
    leafHelp: ["issues", "create", "--help"],
    humanError: ["issues", "create", "--input-json", "{bad"],
    jsonErrorAfterDeepCommand: ["issues", "labels", "add", "--input-json", "{bad", "--json"],
    jsonErrorBeforeDeepCommand: ["--json", "issues", "labels", "add", "--input-json", "{bad"]
  }
  const captureEntries = async (
    entries: ReadonlyArray<readonly [string, ReadonlyArray<string>]>
  ): Promise<ReadonlyArray<readonly [string, OracleProcessResult]>> => {
    const [entry, ...remaining] = entries
    if (entry === undefined) return []
    const [name, args] = entry
    const result = normalizeCliVersion(
      await runOracleProcess(process.execPath, ["packages/huly-cli/dist/index.cjs", ...args], baseEnv)
    )
    return [[name, result], ...(await captureEntries(remaining))]
  }
  return Object.fromEntries(await captureEntries(Object.entries(commands)))
}

const manifestVersion = async (manifestPath: string): Promise<string> =>
  (
    await Schema.decodeUnknownPromise(Schema.fromJsonString(PackageManifestSchema))(
      await fs.readFile(manifestPath, "utf8")
    )
  ).version

const embeddedManifestVersion = async (manifestPath: string, bundlePath: string): Promise<boolean> => {
  const [version, bundle] = await Promise.all([manifestVersion(manifestPath), fs.readFile(bundlePath, "utf8")])
  return bundle.includes(JSON.stringify(version))
}

export const captureBundledProcessOracle = async (): Promise<BundledProcesses> =>
  Schema.decodeUnknownSync(BundledProcessesSchema)({
    artifacts: {
      cli: {
        embeddedManifestVersion: await embeddedManifestVersion(
          "packages/huly-cli/package.json",
          "packages/huly-cli/dist/index.cjs"
        )
      },
      mcp: { embeddedManifestVersion: await embeddedManifestVersion("package.json", "dist/index.cjs") }
    },
    cli: await captureCli(),
    stdio: { native: await captureStdioMode("native"), proxy: await captureStdioMode("proxy") },
    http: { native: await captureHttpMode("native"), proxy: await captureHttpMode("proxy") }
  })
