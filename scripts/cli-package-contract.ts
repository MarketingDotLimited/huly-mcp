import { isCliToolName, type CliToolName } from "../packages/huly-cli/src/catalog.js"
import type { ToolCategory, ToolName } from "../src/mcp/tools/registry.js"

interface CategorizedTool {
  readonly category: ToolCategory
  readonly name: ToolName
}

export const categoryRepresentativeToolNames = (
  categories: ReadonlyArray<ToolCategory>,
  tools: ReadonlyArray<CategorizedTool>
): ReadonlyArray<CliToolName> =>
  categories.map((category) => {
    const representative = tools
      .filter(
        (tool): tool is CategorizedTool & { readonly name: CliToolName } =>
          tool.category === category && isCliToolName(tool.name)
      )
      .map((tool) => tool.name)
      .toSorted()[0]
    if (representative === undefined) {
      throw new Error(`Packed CLI category '${category}' has no catalog representative.`)
    }
    return representative
  })
