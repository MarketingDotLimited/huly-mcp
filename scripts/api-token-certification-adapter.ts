import { spawn, type ChildProcess } from "node:child_process"
import { resolve } from "node:path"

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { Redacted, Schema } from "effect"

import { UrlString, WorkspaceName } from "../src/domain/schemas/shared.js"
import {
  type CertificationCall,
  type CertificationCallResult,
  type CertificationPort
} from "./api-token-certification-workflow.js"
import type { ManagedCertificationPort } from "./api-token-certification-orchestration.js"
import { type CertificationCaptureLedger, redactCertificationSecret } from "./api-token-certification-security.js"

const TOOL_TIMEOUT_MILLISECONDS = 30_000
const STARTUP_TIMEOUT_MILLISECONDS = 10_000
const PROTOCOL_VERSION = "2026-07-28"
const MAXIMUM_TCP_PORT = 65_535

const ToolResultBoundary = Schema.Struct({
  isError: Schema.optionalWith(Schema.Boolean, { exact: true }),
  structuredContent: Schema.optionalWith(Schema.Struct({ result: Schema.Unknown }), { exact: true }),
  content: Schema.Array(Schema.Unknown)
})
const TextContentBoundary = Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })

export const CertificationConnectionConfigSchema = Schema.Struct({
  url: UrlString,
  workspace: WorkspaceName,
  token: Schema.Redacted(Schema.NonEmptyTrimmedString)
})
export type CertificationConnectionConfig = Schema.Schema.Type<typeof CertificationConnectionConfigSchema>

export const CertificationHttpPort = Schema.Number.pipe(
  Schema.int(),
  Schema.between(1, MAXIMUM_TCP_PORT),
  Schema.brand("CertificationHttpPort")
)
export type CertificationHttpPort = Schema.Schema.Type<typeof CertificationHttpPort>

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const firstText = (content: ReadonlyArray<unknown>): string | undefined => {
  for (const item of content) {
    const decoded = Schema.decodeUnknownOption(TextContentBoundary)(item)
    if (decoded._tag === "Some") return decoded.value.text
  }
  return undefined
}

const decodeTextValue = (text: string | undefined): unknown => {
  if (text === undefined) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { text }
  }
}

const toCallResult = (
  rawResult: unknown,
  ledger: CertificationCaptureLedger,
  token: Redacted.Redacted<string>
): CertificationCallResult => {
  const result = Schema.decodeUnknownSync(ToolResultBoundary)(rawResult)
  const text = firstText(result.content)
  if (result.isError === true) {
    const rawMessage = text ?? "The MCP tool returned an error."
    ledger.observe("tool-error", rawMessage)
    return { _tag: "Failure", message: redactCertificationSecret(rawMessage, token) }
  }
  return { _tag: "Success", value: result.structuredContent?.result ?? decodeTextValue(text) }
}

const makeClientPort = (
  client: Client,
  ledger: CertificationCaptureLedger,
  token: Redacted.Redacted<string>
): CertificationPort => ({
  call: async (request: CertificationCall) => {
    try {
      const result = await client.callTool(
        { name: request.tool, arguments: request.arguments },
        { timeout: TOOL_TIMEOUT_MILLISECONDS, maxTotalTimeout: TOOL_TIMEOUT_MILLISECONDS }
      )
      ledger.inspect(JSON.stringify(result) ?? "")
      return toCallResult(result, ledger, token)
    } catch (error) {
      const rawMessage = errorText(error)
      ledger.observe("transport-error", rawMessage)
      return {
        _tag: request.kind === "read" ? "Failure" : "Uncertain",
        message: redactCertificationSecret(rawMessage, token)
      }
    }
  }
})

const makeClient = (): Client =>
  new Client(
    { name: "hulymcp-api-token-certification", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: PROTOCOL_VERSION } } }
  )

export const connectStdioCertificationPort = async (
  config: CertificationConnectionConfig,
  ledger: CertificationCaptureLedger
): Promise<ManagedCertificationPort> => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(process.cwd(), "dist/index.cjs")],
    env: {
      ...getDefaultEnvironment(),
      HULY_URL: config.url,
      HULY_WORKSPACE: config.workspace,
      HULY_TOKEN: Redacted.value(config.token),
      HULY_TOOL_MODE: "native",
      MCP_AUTO_EXIT: "true"
    },
    stderr: "pipe"
  })
  transport.stderr?.on("data", (chunk: Buffer) => ledger.observe("stdio-stderr", chunk.toString("utf8")))
  const client = makeClient()
  await client.connect(transport)
  return { port: makeClientPort(client, ledger, config.token), close: () => client.close() }
}

const withoutHulyCredentials = (environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
  Object.fromEntries(
    Object.entries(environment).filter(
      ([name]) => !["HULY_URL", "HULY_WORKSPACE", "HULY_TOKEN", "HULY_EMAIL", "HULY_PASSWORD"].includes(name)
    )
  )

const terminate = (child: ChildProcess): Promise<void> =>
  new Promise((resolveTermination) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolveTermination()
      return
    }
    child.once("close", () => resolveTermination())
    child.kill("SIGTERM")
  })

const waitForHttpServer = (child: ChildProcess, ledger: CertificationCaptureLedger): Promise<void> =>
  new Promise((resolveStartup, rejectStartup) => {
    let settled = false
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error === undefined) resolveStartup()
      else rejectStartup(error)
    }
    const timer = setTimeout(
      () => finish(new Error("HTTP certification transport did not start within 10 seconds.")),
      STARTUP_TIMEOUT_MILLISECONDS
    )
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8")
      ledger.observe("http-stderr", text)
      if (text.includes("MCP HTTP server listening")) finish()
    })
    child.stdout?.on("data", (chunk: Buffer) => ledger.observe("http-stdout", chunk.toString("utf8")))
    child.once("error", (error) => finish(error))
    child.once("exit", (code, signal) =>
      finish(new Error(`HTTP certification transport exited during startup (${signal ?? `exit ${code}`}).`))
    )
  })

export const connectHttpCertificationPort = async (
  config: CertificationConnectionConfig,
  ledger: CertificationCaptureLedger,
  port: CertificationHttpPort
): Promise<ManagedCertificationPort> => {
  const child = spawn(process.execPath, [resolve(process.cwd(), "dist/index.cjs")], {
    env: {
      ...withoutHulyCredentials(process.env),
      HULY_TOOL_MODE: "native",
      MCP_TRANSPORT: "http",
      MCP_HTTP_HOST: "127.0.0.1",
      MCP_HTTP_PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"]
  })
  try {
    await waitForHttpServer(child, ledger)
    const client = makeClient()
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
      requestInit: {
        headers: {
          "x-huly-url": config.url,
          "x-huly-workspace": config.workspace,
          "x-huly-token": Redacted.value(config.token)
        }
      }
    })
    await client.connect(transport)
    return {
      port: makeClientPort(client, ledger, config.token),
      close: async () => {
        await client.close()
        await terminate(child)
      }
    }
  } catch (error) {
    await terminate(child)
    throw error
  }
}
