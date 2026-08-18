#!/usr/bin/env node
import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { setTimeout as delay } from "node:timers/promises"

const REQUEST_TIMEOUT_MS = 10_000
const READY_TIMEOUT_MS = 15_000
const PROTOCOL_VERSION = "2025-06-18"

const removeHulyEnv = (env) => {
  const clean = { ...env }
  for (const name of [
    "HULY_URL",
    "HULY_WORKSPACE",
    "HULY_EMAIL",
    "HULY_PASSWORD",
    "HULY_TOKEN",
    "HULY_CONNECTION_TIMEOUT"
  ]) {
    delete clean[name]
  }
  return clean
}

const findFreePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate a TCP port")))
        return
      }
      const { port } = address
      server.close((error) => error === undefined ? resolve(port) : reject(error))
    })
  })

const parseMcpResponse = (text) => {
  const data = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s?/, ""))
    .at(-1)

  return JSON.parse(data ?? text)
}

const postJsonRpc = async (endpoint, payload, session) => {
  const requestPayload = payload
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL_VERSION,
      ...(session?.id === undefined ? {} : { "mcp-session-id": session.id })
    },
    body: JSON.stringify(requestPayload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${endpoint}: ${text}`)
  }
  return {
    body: parseMcpResponse(text),
    protocolVersion: response.headers.get("mcp-protocol-version") ?? PROTOCOL_VERSION,
    sessionId: response.headers.get("mcp-session-id") ?? session?.id,
    status: response.status
  }
}

const assertNoError = (label, response) => {
  if (response.error !== undefined) {
    throw new Error(`${label} returned JSON-RPC error: ${JSON.stringify(response.error)}`)
  }
}

const startLocalServer = async (envOverrides = {}) => {
  const port = await findFreePort()
  const endpoint = `http://127.0.0.1:${port}/mcp`
  const env = {
    ...removeHulyEnv(process.env),
    MCP_TRANSPORT: "http",
    MCP_HTTP_HOST: "127.0.0.1",
    MCP_HTTP_PORT: String(port),
    ...envOverrides
  }
  const child = spawn(process.execPath, ["dist/index.cjs"], {
    env,
    stdio: ["ignore", "pipe", "pipe"]
  })
  let stdout = ""
  let stderr = ""
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString()
  })
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString()
  })

  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return
    child.kill("SIGTERM")
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      delay(2_000).then(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
      })
    ])
  }

  return {
    endpoint,
    serverLogs: () => ({ stdout, stderr }),
    stop
  }
}

const initializeSession = async (endpoint, serverLogs) => {
  const deadline = Date.now() + READY_TIMEOUT_MS
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await postJsonRpc(endpoint, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          capabilities: {},
          clientInfo: { name: "http-no-config-smoke", version: "1.0.0" },
          protocolVersion: PROTOCOL_VERSION
        }
      }, undefined)
      assertNoError("initialize", response.body)
      if (response.sessionId === undefined || response.sessionId === "") {
        throw new Error("initialize did not return Mcp-Session-Id")
      }
      return response
    } catch (error) {
      lastError = error
      await delay(250)
    }
  }
  const logs = serverLogs?.()
  throw new Error(
    `Timed out waiting for MCP HTTP endpoint ${endpoint}. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }\nstdout:\n${logs?.stdout ?? ""}\nstderr:\n${logs?.stderr ?? ""}`
  )
}

const runProbe = async (endpoint, serverLogs, label) => {
  const initialized = await initializeSession(endpoint, serverLogs)
  const session = { id: initialized.sessionId }
  const notificationResponse = await fetch(endpoint, {
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }),
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": initialized.protocolVersion,
      "mcp-session-id": session.id
    },
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if (notificationResponse.status !== 202 && notificationResponse.status !== 200) {
    throw new Error(`notifications/initialized returned HTTP ${notificationResponse.status}`)
  }

  const resources = await postJsonRpc(endpoint, {
    jsonrpc: "2.0",
    method: "resources/list",
    id: 2
  }, session)
  assertNoError("resources/list", resources.body)
  if (!Array.isArray(resources.body.result?.resources)) {
    throw new Error(`resources/list did not return a resources array: ${JSON.stringify(resources.body)}`)
  }
  if (resources.body.result.resources.length !== 0) {
    throw new Error(`expected no-config resources/list to return [], got ${JSON.stringify(resources.body.result)}`)
  }

  console.log(`HTTP no-config MCP smoke passed at ${endpoint}${label === undefined ? "" : ` (${label})`}`)
}

const runLocalScenario = async (label, envOverrides = {}) => {
  const local = await startLocalServer(envOverrides)
  try {
    await runProbe(local.endpoint, local.serverLogs, label)
  } finally {
    await local.stop()
  }
}

const run = async () => {
  const externalEndpoint = process.env["MCP_SMOKE_ENDPOINT"]
  if (externalEndpoint !== undefined) {
    await runProbe(externalEndpoint, undefined, "external endpoint")
    return
  }

  await runLocalScenario("Huly env absent")
  await runLocalScenario("empty Huly env placeholders", {
    HULY_URL: "",
    HULY_WORKSPACE: "",
    HULY_TOKEN: ""
  })
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
