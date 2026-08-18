import { spawn } from "node:child_process"

const request = (id, method, params) => JSON.stringify({ jsonrpc: "2.0", method, params, id })
const meta = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "unreachable-smoke", version: "1.0" }
}
const input = [
  request(1, "server/discover", { _meta: meta }),
  request(2, "tools/call", { name: "list_projects", arguments: {}, _meta: meta })
].join("\n") + "\n"

const child = spawn(process.execPath, ["dist/index.cjs"], {
  env: {
    ...process.env,
    HULY_URL: "http://127.0.0.1:9",
    HULY_WORKSPACE: "unreachable-smoke",
    HULY_TOKEN: "unreachable-smoke-token",
    HULY_CONNECTION_TIMEOUT: "100",
    MCP_AUTO_EXIT: "true"
  },
  stdio: ["pipe", "pipe", "pipe"]
})
let stdout = ""
let stderr = ""
child.stdout.on("data", chunk => { stdout += chunk })
child.stderr.on("data", chunk => { stderr += chunk })
child.stdin.end(input)

const exitCode = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    child.kill()
    reject(new Error("stdio unreachable smoke timed out"))
  }, 5_000)
  child.on("error", reject)
  child.on("exit", code => {
    clearTimeout(timeout)
    resolve(code)
  })
})

if (exitCode !== 0) throw new Error(`stdio unreachable smoke failed: ${stderr}`)
const responses = stdout.trim().split("\n").map(line => JSON.parse(line))
const discovery = responses.find(response => response.id === 1)
const toolCall = responses.find(response => response.id === 2)
if (discovery?.result === undefined || toolCall?.result?.isError !== true) {
  throw new Error(`unexpected stdio unreachable smoke response: ${stdout}`)
}
if (!toolCall.result.content?.[0]?.text.includes("Cannot reach the configured Huly endpoint")) {
  throw new Error(`missing safe unreachable diagnostic: ${stdout}`)
}
console.log("stdio unreachable MCP smoke passed")
