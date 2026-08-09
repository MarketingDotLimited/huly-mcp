import { Schema } from "effect"

import { ToolName } from "../src/mcp/tools/registry.js"

const FullIntegrationProtocolOnlyCaseSchema = Schema.Literal(
  "resources/templates/list",
  "resources/list(projects)",
  "resources/read project",
  "resources/read issue"
)
export const FullIntegrationProtocolOnlyCasesSchema = Schema.Array(FullIntegrationProtocolOnlyCaseSchema)
export const FullIntegrationToolNamesSchema = Schema.Array(ToolName)
export const FullIntegrationInventorySchema = Schema.Struct({
  artifact: Schema.Literal("bundled-mcp", "packed-cli"),
  protocolOnlyCases: FullIntegrationProtocolOnlyCasesSchema,
  scenario: Schema.Literal("scripts/integration_test_full.sh"),
  surface: Schema.Literal("mcp", "cli"),
  toolCalls: FullIntegrationToolNamesSchema,
  uniqueTools: FullIntegrationToolNamesSchema
})
export type FullIntegrationInventory = Schema.Schema.Type<typeof FullIntegrationInventorySchema>
