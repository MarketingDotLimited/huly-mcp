import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import { allTools } from "../../src/mcp/tools/index.js"

const toolNames = [
  "create_huly_permission",
  "update_huly_permission",
  "delete_huly_permission",
  "create_space_role",
  "set_space_role_permissions",
  "get_class_collaborator_metadata",
  "set_class_collaborator_metadata",
  "delete_class_collaborator_metadata"
] as const

describe("security administration MCP tools", () => {
  it.effect("registers guarded security metadata operations as one category", () =>
    Effect.sync(() => {
      const tools = toolNames.map((name) => allTools.find((tool) => tool.name === name))
      expect(tools.every((tool) => tool !== undefined)).toBe(true)
      expect(tools.map((tool) => tool?.category)).toEqual(toolNames.map(() => "security-administration"))
      for (const tool of tools.filter((candidate) => candidate?.name !== "get_class_collaborator_metadata")) {
        expect(tool?.description).toContain("confirm=true")
      }
    })
  )

  it.effect("documents name resolution and unsafe-operation guardrails", () =>
    Effect.sync(() => {
      const createRole = allTools.find((tool) => tool.name === "create_space_role")
      const updatePermission = allTools.find((tool) => tool.name === "update_huly_permission")
      const deletePermission = allTools.find((tool) => tool.name === "delete_huly_permission")
      const setCollaborators = allTools.find((tool) => tool.name === "set_class_collaborator_metadata")

      expect(createRole?.description).toContain("SpaceType ID or exact name")
      expect(createRole?.description).toContain("permission ID or exact label")
      expect(updatePermission?.description).toContain("built-in")
      expect(deletePermission?.description).toContain("referenced")
      expect(setCollaborators?.description).toContain("class ID, tail name, or label")
    })
  )
})
