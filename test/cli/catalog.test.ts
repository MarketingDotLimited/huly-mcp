import { describe, expect, it } from "vitest"

import type { CliCommandSpec } from "../../packages/huly-cli/src/catalog-types.js"
import { cliCommandCatalog, ignoredMcpTools, isCliToolName } from "../../packages/huly-cli/src/catalog.js"
import { allTools, resolveAnnotations } from "../../src/mcp/tools/index.js"
import {
  CLI_BEHAVIOR_CLASSES,
  CLI_DEDICATED_LIVE_RISK_CLASSES,
  CLI_PARITY_BASELINE,
  CLI_PARITY_TARGET
} from "../../packages/huly-cli/src/parity-contract.js"
import {
  CONSEQUENTIAL_CLI_TOOLS,
  hasExplicitCliConfirmationPolicy
} from "../../packages/huly-cli/src/safety-policies.js"
import { collectFieldSpecs, collectRequiredFieldNames } from "../../packages/huly-cli/src/schema-fields.js"

const catalogEntries = () => Object.entries(cliCommandCatalog)

const pathKey = (path: ReadonlyArray<string>): string => path.join(" ")

describe("CLI catalog", () => {
  it("records the auditable parity baseline and target", () => {
    expect(CLI_PARITY_BASELINE).toEqual({
      registryOperations: 522,
      cliRoutes: 451,
      ignoredOperations: 71,
      directLiveCases: 68,
      deferredLiveCases: 383
    })
    expect(CLI_PARITY_TARGET).toEqual({ ignoredOperations: 0, routesPerRegistryOperation: 1 })
    expect(CLI_BEHAVIOR_CLASSES).toContain("structured-json-input")
    expect(CLI_BEHAVIOR_CLASSES).toContain("workspace-administration")
    expect(CLI_DEDICATED_LIVE_RISK_CLASSES).toEqual(["transport", "safety", "privacy", "workspace-client", "lifecycle"])
  })
  it("has exactly one CLI route for every registry operation and no ignored operations", () => {
    const implemented = new Set(Object.keys(cliCommandCatalog))
    const toolNames = allTools.map((tool) => tool.name)

    expect(ignoredMcpTools).toEqual([])
    expect(implemented.size).toBe(allTools.length)
    expect(toolNames.filter((name) => !implemented.has(name))).toEqual([])
  })

  it("keeps generated CLI command paths unique and non-overlapping", () => {
    const byPath = new Map<string, Array<string>>()
    for (const [toolName, spec] of catalogEntries()) {
      const key = pathKey(spec.path)
      byPath.set(key, [...(byPath.get(key) ?? []), toolName])
    }

    const duplicates = [...byPath.entries()].filter(([, toolNames]) => toolNames.length > 1)
    const prefixConflicts = catalogEntries().flatMap(([toolName, spec]) =>
      catalogEntries()
        .filter(
          ([otherToolName, otherSpec]) =>
            toolName !== otherToolName &&
            spec.path.length < otherSpec.path.length &&
            spec.path.every((segment, index) => otherSpec.path[index] === segment)
        )
        .map(([otherToolName]) => [toolName, otherToolName])
    )

    expect(duplicates).toEqual([])
    expect(prefixConflicts).toEqual([])
  })

  it("records explicit CLI confirmation for every destructive operation", () => {
    const missing = allTools.flatMap((tool) => {
      if (!isCliToolName(tool.name)) return []
      const spec: CliCommandSpec = cliCommandCatalog[tool.name]
      return resolveAnnotations(tool.operation).destructiveHint === true &&
        !hasExplicitCliConfirmationPolicy(tool.name, spec)
        ? [tool.name]
        : []
    })

    expect(missing).toEqual([])
  })

  it("requires explicit confirmation for every security-administration write", () => {
    const missing = allTools.flatMap((tool) => {
      if (tool.category !== "security-administration" || !isCliToolName(tool.name)) return []
      const spec: CliCommandSpec = cliCommandCatalog[tool.name]
      return resolveAnnotations(tool.operation).readOnlyHint !== true &&
        !hasExplicitCliConfirmationPolicy(tool.name, spec)
        ? [tool.name]
        : []
    })

    expect(missing).toEqual([])
  })

  it("keeps every classified consequential operation behind explicit confirmation", () => {
    const missing = CONSEQUENTIAL_CLI_TOOLS.filter(
      (toolName) => !hasExplicitCliConfirmationPolicy(toolName, cliCommandCatalog[toolName])
    )

    expect(missing).toEqual([])
  })

  it("keeps positional and file-policy field names synchronized with operation schemas", () => {
    const errors = allTools.flatMap((tool) => {
      if (!isCliToolName(tool.name)) return []
      const spec: CliCommandSpec = cliCommandCatalog[tool.name]
      const fields = new Set(
        [...collectFieldSpecs(tool.operation.inputSchema).values()].map((field) => field.fieldName)
      )
      const required = collectRequiredFieldNames(tool.operation.inputSchema)
      const behaviorFields = [
        ...(spec.behavior?.fileInput?.fields ?? []),
        ...(spec.behavior?.base64FileInput?.fields ?? [])
      ]
      const unknown = [...spec.positional, ...behaviorFields].filter((field) => !fields.has(field))
      const optionalPositionals = spec.positional.filter((field) => !required.has(field))
      return [
        ...unknown.map((field) => `${tool.name}: unknown field ${field}`),
        ...optionalPositionals.map((field) => `${tool.name}: optional positional ${field}`)
      ]
    })

    expect(errors).toEqual([])
  })

  it("keeps notable generated paths aligned with the public command vocabulary", () => {
    expect(cliCommandCatalog.list_tags.path).toEqual(["tags", "list"])
    expect(cliCommandCatalog.create_tag.path).toEqual(["tags", "create"])
    expect(cliCommandCatalog.list_tag_categories.path).toEqual(["tags", "categories", "list"])
  })

  it("explains upload source locations in attachment commands", () => {
    for (const description of [
      cliCommandCatalog.add_issue_attachment.description,
      cliCommandCatalog.add_document_attachment.description
    ]) {
      expect(description).toContain("CLI process")
      expect(description).toContain("canonical base64")
      expect(description).toContain("--data-base64-file")
    }
  })

  it("narrows CLI tool names at runtime", () => {
    expect(isCliToolName("list_projects")).toBe(true)
    expect(isCliToolName("not_a_tool")).toBe(false)
  })
})
