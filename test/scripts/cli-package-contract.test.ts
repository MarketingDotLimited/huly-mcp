import { describe, expect, it } from "vitest"

import { categoryRepresentativeToolNames } from "../../scripts/cli-package-contract.js"
import { ToolCategory, ToolName } from "../../src/mcp/tools/registry.js"

describe("packed CLI category contract", () => {
  it("derives one deterministic CLI representative per reviewed category", () => {
    const representatives = categoryRepresentativeToolNames(
      [ToolCategory.make("issues"), ToolCategory.make("projects")],
      [
        { category: ToolCategory.make("projects"), name: ToolName.make("list_projects") },
        { category: ToolCategory.make("issues"), name: ToolName.make("update_issue") },
        { category: ToolCategory.make("issues"), name: ToolName.make("get_issue") }
      ]
    )

    expect(representatives).toEqual(["get_issue", "list_projects"])
  })

  it("rejects a reviewed category without a CLI route", () => {
    expect(() => categoryRepresentativeToolNames([ToolCategory.make("issues")], [])).toThrow(
      "Packed CLI category 'issues' has no catalog representative."
    )
  })
})
