import { spawn } from "node:child_process"

import { Schema } from "effect"
import { describe, expect, it } from "vitest"

const ProcessResultSchema = Schema.Struct({ exitCode: Schema.Int, stderr: Schema.String, stdout: Schema.String })

const runCli = (args: ReadonlyArray<string>): Promise<Schema.Schema.Type<typeof ProcessResultSchema>> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["packages/huly-cli/dist/index.cjs", ...args], {
      cwd: process.cwd(),
      env: {}
    })
    const stdout: Array<Buffer> = []
    const stderr: Array<Buffer> = []
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))
    child.on("error", reject)
    child.on("close", (exitCode) =>
      resolve(
        Schema.decodeUnknownSync(ProcessResultSchema)({
          exitCode,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8")
        })
      )
    )
  })

const runDefectBoundary = (): Promise<Schema.Schema.Type<typeof ProcessResultSchema>> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "test/cli/fixtures/defect-process.ts"], {
      cwd: process.cwd(),
      env: {}
    })
    const stdout: Array<Buffer> = []
    const stderr: Array<Buffer> = []
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))
    child.on("error", reject)
    child.on("close", (exitCode) =>
      resolve(
        Schema.decodeUnknownSync(ProcessResultSchema)({
          exitCode,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8")
        })
      )
    )
  })

describe("CLI failure process boundary", () => {
  it("writes one JSON failure to stderr, keeps stdout empty, and exits by taxonomy", async () => {
    const result = await runCli(["issues", "create", "--input-json", "{bad", "--json"])

    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe("")
    expect(result.stderr.trim().split("\n")).toHaveLength(1)
    expect(JSON.parse(result.stderr)).toMatchObject({ code: "INVALID_INPUT", retryable: false })
  })

  it("keeps human failure output actionable and off stdout", async () => {
    const result = await runCli(["issues", "create", "--input-json", "{bad"])

    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("Invalid JSON in --input-json")
    expect(result.stderr).not.toContain('"code"')
  })

  it("translates an unknown command into one JSON input failure", async () => {
    const result = await runCli(["nonsense", "--json"])

    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe("")
    expect(result.stderr.trim().split("\n")).toHaveLength(1)
    expect(JSON.parse(result.stderr)).toMatchObject({ code: "INVALID_INPUT", retryable: false })
  })

  it("translates a missing required option into one JSON input failure", async () => {
    const result = await runCli(["profile", "create", "bad", "--json"])

    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe("")
    expect(result.stderr.trim().split("\n")).toHaveLength(1)
    expect(JSON.parse(result.stderr)).toMatchObject({ code: "INVALID_INPUT", retryable: false })
  })

  it("sanitizes an Effect defect at the process boundary", async () => {
    const result = await runDefectBoundary()

    expect(result.exitCode).toBe(70)
    expect(result.stdout).toBe("")
    expect(result.stderr.trim().split("\n")).toHaveLength(1)
    expect(JSON.parse(result.stderr)).toMatchObject({ code: "INTERNAL_ERROR", retryable: false })
    expect(result.stderr).not.toContain("secret defect detail")
    expect(result.stderr).not.toContain("FiberFailure")
  })
})
