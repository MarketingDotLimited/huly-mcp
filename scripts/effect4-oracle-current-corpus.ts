import { getHulyContextToolDefinition, versionToolDefinition } from "../src/mcp/huly-context-tool.js"
import { proxyToolDefinitions } from "../src/mcp/proxy-tools.js"
import { toolRegistry } from "../src/mcp/tools/index.js"
import { validateDraft07ToolCorpus } from "./effect4-oracle-draft07.js"

export const validateCurrentDraft07Corpora = (): { readonly native: number; readonly proxy: number } => {
  const native = validateDraft07ToolCorpus([
    ...toolRegistry.definitions,
    versionToolDefinition,
    getHulyContextToolDefinition
  ])
  const proxy = validateDraft07ToolCorpus([
    ...proxyToolDefinitions,
    versionToolDefinition,
    getHulyContextToolDefinition
  ])
  return { native: native.length, proxy: proxy.length }
}
