import { execFileSync } from "node:child_process"

import { Schema } from "effect"
import { beforeAll, describe, expect, it } from "vitest"

import { cliCommandCatalog } from "../../packages/huly-cli/src/catalog.js"
import {
  type FullIntegrationInventory,
  FullIntegrationInventorySchema
} from "../../scripts/full-integration-inventory-contract.js"

const INVENTORY_PROCESS_TIMEOUT_MILLISECONDS = 10_000
const INVENTORY_SETUP_TIMEOUT_MILLISECONDS = 30_000

const inventory = (script: string) => {
  const stdout = execFileSync("bash", [script, "--list-tool-cases"], {
    encoding: "utf8",
    timeout: INVENTORY_PROCESS_TIMEOUT_MILLISECONDS
  })
  const parsed: unknown = JSON.parse(stdout)
  return Schema.decodeUnknownSync(FullIntegrationInventorySchema)(parsed)
}

describe("full CLI integration mirror", () => {
  let mcp: FullIntegrationInventory
  let cli: FullIntegrationInventory

  beforeAll(() => {
    mcp = inventory("scripts/integration_test_full.sh")
    cli = inventory("scripts/integration_test_cli_full.sh")
  }, INVENTORY_SETUP_TIMEOUT_MILLISECONDS)

  it("exposes the same operation inventory as the MCP integration suite", () => {
    expect(cli.toolCalls).toEqual(mcp.toolCalls)
    expect(cli.uniqueTools).toEqual(mcp.uniqueTools)
    expect(cli.protocolOnlyCases).toEqual(mcp.protocolOnlyCases)
    expect(mcp).toMatchObject({ artifact: "bundled-mcp", scenario: "scripts/integration_test_full.sh", surface: "mcp" })
    expect(cli).toMatchObject({ artifact: "packed-cli", scenario: "scripts/integration_test_full.sh", surface: "cli" })
    expect(mcp.toolCalls.length).toBeGreaterThan(700)
    expect(mcp.uniqueTools.length).toBeGreaterThan(400)
    expect(mcp.uniqueTools).toContain("list_projects")
    expect(mcp.uniqueTools).toContain("read_attachment_content")
    expect(mcp.protocolOnlyCases).toEqual([
      "resources/templates/list",
      "resources/list(projects)",
      "resources/read project",
      "resources/read issue"
    ])
  })

  it("has a CLI command for every tool in the shared scenario", () => {
    const cliTools = new Set(Object.keys(cliCommandCatalog))
    const missingTools = mcp.uniqueTools.filter((toolName) => !cliTools.has(toolName))

    expect(missingTools).toEqual([])
  })
})
