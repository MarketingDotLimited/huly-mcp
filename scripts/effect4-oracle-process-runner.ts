import { spawn } from "node:child_process"

import { Result, Schema } from "effect"

import { type OracleProcessResult, OracleProcessResultSchema } from "./effect4-oracle-schema.js"

const PROCESS_TIMEOUT_MILLISECONDS = 15_000
const PROCESS_TERMINATION_GRACE_MILLISECONDS = 1_000
const PROCESS_EXIT_SIGNALLED = -1
const OracleJsonRpcResponseEnvelopeSchema = Schema.Struct({
  id: Schema.Union([Schema.String, Schema.Number]),
  jsonrpc: Schema.Literal("2.0")
})
const decodeOracleResponseLine = Schema.decodeUnknownResult(Schema.fromJsonString(OracleJsonRpcResponseEnvelopeSchema))

const isOracleResponseLine = (line: string): boolean => Result.isSuccess(decodeOracleResponseLine(line))

export const runOracleProcess = (
  executable: string,
  args: ReadonlyArray<string>,
  env: Readonly<Record<string, string>>,
  stdin = "",
  timeoutMilliseconds = PROCESS_TIMEOUT_MILLISECONDS,
  closeStdinAfterStdoutLines?: number
): Promise<OracleProcessResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: process.cwd(), env, stdio: ["pipe", "pipe", "pipe"] })
    const stdout: Array<Buffer> = []
    const stderr: Array<Buffer> = []
    let stdoutLineBuffer = ""
    let stdoutResponseLineCount = 0
    let stdinClosed = false
    let timedOut = false
    let forceKillTimeout: ReturnType<typeof setTimeout> | undefined
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
      forceKillTimeout = setTimeout(() => child.kill("SIGKILL"), PROCESS_TERMINATION_GRACE_MILLISECONDS)
    }, timeoutMilliseconds)
    child.stdout.on("data", (chunk: Buffer) => {
      stdout.push(chunk)
      if (closeStdinAfterStdoutLines === undefined || stdinClosed) return
      stdoutLineBuffer += chunk.toString("utf8")
      const lines = stdoutLineBuffer.split("\n")
      stdoutLineBuffer = lines.pop() ?? ""
      stdoutResponseLineCount += lines.filter(isOracleResponseLine).length
      if (stdoutResponseLineCount < closeStdinAfterStdoutLines) return
      stdinClosed = true
      child.stdin.end()
    })
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))
    child.on("error", (error) => {
      clearTimeout(timeout)
      if (forceKillTimeout !== undefined) clearTimeout(forceKillTimeout)
      reject(error)
    })
    child.on("close", (exitCode) => {
      clearTimeout(timeout)
      if (forceKillTimeout !== undefined) clearTimeout(forceKillTimeout)
      if (timedOut) {
        reject(new Error(`Oracle process timed out and was terminated: ${args.join(" ")}`))
        return
      }
      resolve(
        Schema.decodeUnknownSync(OracleProcessResultSchema)({
          exitCode: exitCode ?? PROCESS_EXIT_SIGNALLED,
          stderr: Buffer.concat(stderr).toString("utf8"),
          stdout: Buffer.concat(stdout).toString("utf8")
        })
      )
    })
    if (closeStdinAfterStdoutLines === undefined) {
      stdinClosed = true
      child.stdin.end(stdin)
    } else {
      child.stdin.write(stdin)
    }
  })
