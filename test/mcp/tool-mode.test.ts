import { Option } from "effect"
import { describe, expect, it } from "vitest"

import {
  classifyMcpClient,
  type ClientKind,
  DEFAULT_MODE_BY_CLIENT_KIND,
  type McpClientInfoLike,
  parseMcpClientInfo,
  parseMcpClientInfoFromUserAgent,
  parseMcpClientInfoEnvelope,
  parseToolExposureConfig,
  resolveRequestMcpClientInfo,
  resolveToolExposureMode,
  type ResolveToolExposureModeInput,
  type ToolExposureMode,
  type ToolModeConfig
} from "../../src/mcp/tool-mode.js"

const clientInfo = (name: string): McpClientInfoLike => {
  const parsed = parseMcpClientInfo({ name })
  if (parsed === undefined) throw new Error(`expected valid client info for ${name}`)
  return parsed
}

describe("classifyMcpClient", () => {
  it("parses request-local client identity from the modern protocol envelope", () => {
    expect(parseMcpClientInfoEnvelope({ "io.modelcontextprotocol/clientInfo": { name: " codex-cli " } })).toEqual({
      name: "codex-cli"
    })
    expect(parseMcpClientInfoEnvelope({})).toBeUndefined()
    expect(parseMcpClientInfoEnvelope({ "io.modelcontextprotocol/clientInfo": { name: 42 } })).toBeUndefined()
  })

  it("does not reuse connection identity when a modern request omits optional client info", () => {
    const connectionClient = clientInfo("claude-code")
    const codexEnvelope = { "io.modelcontextprotocol/clientInfo": { name: "codex-cli" } }

    expect(resolveRequestMcpClientInfo(codexEnvelope, () => connectionClient)).toEqual(
      Option.some({ name: "codex-cli" })
    )
    expect(resolveRequestMcpClientInfo({}, () => connectionClient)).toEqual(Option.none())
    expect(resolveRequestMcpClientInfo(undefined, () => connectionClient)).toEqual(Option.some(connectionClient))
  })

  it("allows stateless HTTP callers to opt into request-local User-Agent fallback", () => {
    const httpClient = clientInfo("openai-mcp")

    expect(resolveRequestMcpClientInfo({}, () => httpClient, true)).toEqual(Option.some(httpClient))
    expect(
      resolveRequestMcpClientInfo(
        { "io.modelcontextprotocol/clientInfo": { name: "codex-cli" } },
        () => httpClient,
        true
      )
    ).toEqual(Option.some({ name: "codex-cli" }))
  })

  it("classifies known client names after trimming and case normalization", () => {
    const cases: ReadonlyArray<{ readonly clientInfo: McpClientInfoLike; readonly expected: ClientKind }> = [
      { clientInfo: clientInfo(" claude-code "), expected: "claude-code" },
      { clientInfo: clientInfo("Claude-AI"), expected: "claude-ai" },
      { clientInfo: clientInfo("cursor-vscode"), expected: "cursor" },
      { clientInfo: clientInfo("Cursor Desktop"), expected: "cursor" },
      { clientInfo: clientInfo("windsurf-ide"), expected: "windsurf" },
      { clientInfo: clientInfo("cascade"), expected: "windsurf" },
      { clientInfo: clientInfo("github-copilot-chat"), expected: "github-copilot" },
      { clientInfo: clientInfo("copilot"), expected: "github-copilot" },
      { clientInfo: clientInfo("github-copilot-developer"), expected: "github-copilot" },
      { clientInfo: clientInfo("Visual Studio Code"), expected: "github-copilot" },
      { clientInfo: clientInfo("Visual-Studio-Code"), expected: "github-copilot" },
      { clientInfo: clientInfo("ChatGPT"), expected: "chatgpt" },
      { clientInfo: clientInfo("openai-mcp"), expected: "chatgpt" },
      { clientInfo: clientInfo("codex-cli"), expected: "codex" },
      { clientInfo: clientInfo("openai-codex"), expected: "codex" },
      { clientInfo: clientInfo("opencode"), expected: "opencode" }
    ]

    for (const testCase of cases) {
      expect(classifyMcpClient(testCase.clientInfo)).toBe(testCase.expected)
    }
  })

  it("derives request-local client identity from stateless HTTP User-Agent products", () => {
    expect(parseMcpClientInfoFromUserAgent("openai-mcp/1.0.0")).toEqual({ name: "openai-mcp", version: "1.0.0" })
    expect(parseMcpClientInfoFromUserAgent("codex-mcp-client/0.151.0 extra-product/1")).toEqual({
      name: "codex-mcp-client",
      version: "0.151.0"
    })
    expect(parseMcpClientInfoFromUserAgent(null)).toBeUndefined()
    expect(parseMcpClientInfoFromUserAgent(42)).toBeUndefined()
    expect(parseMcpClientInfoFromUserAgent("   ")).toBeUndefined()
  })

  it("classifies remote-wrapper names by their base client", () => {
    expect(classifyMcpClient(clientInfo("claude-ai (via mcp-remote)"))).toBe("claude-ai")
    expect(classifyMcpClient(clientInfo(" Cursor-vscode (via mcp-remote) "))).toBe("cursor")
  })

  it("keeps wrapped claude-code out of the exact native-only classification", () => {
    expect(classifyMcpClient(clientInfo("claude-code (via mcp-remote)"))).toBe("unknown")
    expect(
      resolveToolExposureMode({ configuredMode: "auto", clientInfo: clientInfo("claude-code (via mcp-remote)") })
    ).toBe("proxy")
  })

  it("defaults missing and unknown client names to unknown", () => {
    expect(classifyMcpClient(undefined)).toBe("unknown")
    expect(classifyMcpClient({})).toBe("unknown")
    expect(classifyMcpClient(parseMcpClientInfo({ name: "  " }))).toBe("unknown")
    expect(classifyMcpClient(clientInfo("some-new-client"))).toBe("unknown")
  })
})

describe("resolveToolExposureMode", () => {
  it("uses explicit configured modes without client classification", () => {
    const nativeMode: ToolModeConfig = "native"
    const proxyMode: ToolModeConfig = "proxy"

    expect(resolveToolExposureMode({ configuredMode: nativeMode })).toBe("native")
    expect(resolveToolExposureMode({ configuredMode: proxyMode })).toBe("proxy")
  })

  it("maps auto mode through the default client-kind table", () => {
    const defaults: Record<ClientKind, ToolExposureMode> = DEFAULT_MODE_BY_CLIENT_KIND
    const input: ResolveToolExposureModeInput = { configuredMode: "auto", clientInfo: clientInfo("claude-code") }

    expect(defaults["claude-code"]).toBe("native")
    expect(defaults.chatgpt).toBe("proxy")
    expect(defaults.unknown).toBe("proxy")
    expect(resolveToolExposureMode(input)).toBe("native")
    expect(resolveToolExposureMode({ configuredMode: "auto", clientInfo: clientInfo("claude-ai") })).toBe("proxy")
    expect(resolveToolExposureMode({ configuredMode: "auto" })).toBe("proxy")
  })
})

describe("parseToolExposureConfig", () => {
  it("defaults to auto mode and non-strict proxy output", () => {
    expect(parseToolExposureConfig({})).toEqual({
      _tag: "Success",
      value: { configuredMode: "auto", proxyOutputStrict: false }
    })
  })

  it("parses supported mode and strict values after trimming and case normalization", () => {
    expect(parseToolExposureConfig({ hulyToolMode: " PROXY ", proxyOutputStrict: " TRUE " })).toEqual({
      _tag: "Success",
      value: { configuredMode: "proxy", proxyOutputStrict: true }
    })
    expect(parseToolExposureConfig({ hulyToolMode: "native", proxyOutputStrict: "false" })).toEqual({
      _tag: "Success",
      value: { configuredMode: "native", proxyOutputStrict: false }
    })
  })

  it("rejects invalid exposure env values with field-specific messages", () => {
    expect(parseToolExposureConfig({ hulyToolMode: "dynamic" })).toMatchObject({
      _tag: "Failure",
      field: "HULY_TOOL_MODE",
      message: expect.stringContaining("auto, native, or proxy")
    })
    expect(parseToolExposureConfig({ proxyOutputStrict: "yes" })).toMatchObject({
      _tag: "Failure",
      field: "PROXY_OUTPUT_STRICT",
      message: expect.stringContaining("true or false")
    })
    expect(parseToolExposureConfig({ hulyToolMode: " " })).toMatchObject({ _tag: "Failure", field: "HULY_TOOL_MODE" })
  })

  it("rejects invalid exposure env shapes instead of defaulting", () => {
    expect(parseToolExposureConfig({ hulyToolMode: 123 })).toMatchObject({
      _tag: "Failure",
      field: "HULY_TOOL_MODE",
      message: expect.stringContaining("must be a string")
    })
    expect(parseToolExposureConfig({ proxyOutputStrict: true })).toMatchObject({
      _tag: "Failure",
      field: "PROXY_OUTPUT_STRICT",
      message: expect.stringContaining("must be a string")
    })
    expect(parseToolExposureConfig(null)).toMatchObject({
      _tag: "Failure",
      field: "HULY_TOOL_MODE",
      message: expect.stringContaining("string environment values")
    })
    expect(parseToolExposureConfig([])).toMatchObject({
      _tag: "Failure",
      field: "HULY_TOOL_MODE",
      message: expect.stringContaining("string environment values")
    })
    expect(parseToolExposureConfig({ hulyToolMode: "auto", proxyOutputStrict: undefined })).toMatchObject({
      _tag: "Failure",
      field: "HULY_TOOL_MODE",
      message: expect.stringContaining("string environment values")
    })
  })
})
