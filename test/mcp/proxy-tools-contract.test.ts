import { describe, expect, it } from "vitest"

import {
  EXECUTE_APPROVED_TOOL_ACTION_TOOL_NAME,
  INVOKE_READ_TOOL_TOOL_NAME,
  INVOKE_WRITE_TOOL_TOOL_NAME,
  PREPARE_TOOL_ACTION_TOOL_NAME,
  PROXY_TOOL_NAMES,
  proxyToolDefinitions
} from "../../src/mcp/proxy-tools.js"

const definition = (name: string) => {
  const tool = proxyToolDefinitions.find((candidate) => candidate.name === name)
  if (tool === undefined) throw new Error(`missing proxy tool definition: ${name}`)
  return tool
}

describe("ChatGPT proxy tool contract", () => {
  it("derives every exported proxy name from the canonical definitions", () => {
    expect(PROXY_TOOL_NAMES).toEqual(proxyToolDefinitions.map((tool) => tool.name))
    expect(new Set(PROXY_TOOL_NAMES).size).toBe(PROXY_TOOL_NAMES.length)
  })

  it("publishes split executors with truthful safety annotations", () => {
    expect(definition(INVOKE_READ_TOOL_TOOL_NAME).annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true
    })
    expect(definition(INVOKE_WRITE_TOOL_TOOL_NAME).annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false
    })
    expect(definition(PREPARE_TOOL_ACTION_TOOL_NAME).annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false
    })
    expect(definition(EXECUTE_APPROVED_TOOL_ACTION_TOOL_NAME).annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true
    })
  })
})
