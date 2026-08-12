import * as fs from "node:fs/promises"

import { Schema } from "effect"

import {
  type BundledProcesses,
  BundledProcessesSchema,
  type OracleJsonRpcRequest,
  type OracleJsonRpcResponse,
  OracleJsonRpcRequestSchema,
  OracleJsonRpcResponseSchema,
  type OracleMethod,
  type OracleProcessResult
} from "./effect4-oracle-schema.js"
import { runOracleProcess } from "./effect4-oracle-process-runner.js"

const FINAL_PROTOCOL_VERSION = "2026-07-28"
const LEGACY_PROTOCOL_VERSION = "2025-06-18"
export const LIST_TOOLS_REQUEST_ID = 2
const LIST_RESOURCE_TEMPLATES_REQUEST_ID = 3
const MISSING_ARGUMENTS_REQUEST_ID = 4
const EXTRA_ARGUMENTS_REQUEST_ID = 5
const UNKNOWN_TOOL_REQUEST_ID = 6
const LIST_RESOURCES_REQUEST_ID = 7
const PACKAGE_VERSION_PLACEHOLDER = "<package-version>"
const SERVER_INFO_META_KEY = "io.modelcontextprotocol/serverInfo"
const PackageManifestSchema = Schema.Struct({ version: Schema.String })

const meta = {
  "io.modelcontextprotocol/protocolVersion": FINAL_PROTOCOL_VERSION,
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "effect-migration-oracle", version: "1.0.0" }
}

const request = (id: number, method: OracleMethod, params: Readonly<Record<string, unknown>>): OracleJsonRpcRequest =>
  Schema.decodeUnknownSync(OracleJsonRpcRequestSchema)({
    id,
    jsonrpc: "2.0",
    method,
    params: { ...params, _meta: meta }
  })

const stdioRequests = (): ReadonlyArray<OracleJsonRpcRequest> => [
  request(1, "server/discover", {}),
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

const decodeStdioResponses = (stdout: string): ReadonlyArray<OracleJsonRpcResponse> =>
  stdout
    .trim()
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => Schema.decodeUnknownSync(Schema.fromJsonString(OracleJsonRpcResponseSchema))(line))
    .map(normalizeServerVersion)

const captureStdioMode = async (mode: "native" | "proxy") => {
  const input = `${stdioRequests()
    .map((entry) => JSON.stringify(Schema.encodeSync(OracleJsonRpcRequestSchema)(entry)))
    .join("\n")}\n`
  const result = await runOracleProcess(
    process.execPath,
    ["dist/index.cjs"],
    { HULY_TOOL_MODE: mode, LAZY_ENVS: "true", MCP_AUTO_EXIT: "true" },
    input
  )
  if (result.exitCode !== 0 || result.stderr !== "") {
    throw new Error(`Bundled ${mode} stdio oracle failed with exit ${result.exitCode}: ${result.stderr}`)
  }
  return decodeStdioResponses(result.stdout)
}

const captureLegacyStdio = async (): Promise<ReadonlyArray<OracleJsonRpcResponse>> => {
  const messages = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: LEGACY_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "effect-migration-oracle", version: "1.0.0" }
      }
    },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: LIST_TOOLS_REQUEST_ID, method: "tools/list", params: {} }
  ]
  const result = await runOracleProcess(
    process.execPath,
    ["dist/index.cjs"],
    { HULY_TOOL_MODE: "proxy", LAZY_ENVS: "true", MCP_AUTO_EXIT: "true" },
    `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`
  )
  if (result.exitCode !== 0 || result.stderr !== "") {
    throw new Error(`Bundled legacy stdio oracle failed with exit ${result.exitCode}: ${result.stderr}`)
  }
  return decodeStdioResponses(result.stdout)
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
    stdio: {
      legacy: await captureLegacyStdio(),
      native: await captureStdioMode("native"),
      proxy: await captureStdioMode("proxy")
    }
  })
