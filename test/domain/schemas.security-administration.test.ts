import { describe, it } from "@effect/vitest"
import { Effect, Exit } from "effect"
import { expect } from "vitest"

import {
  parseCreateHulyPermissionParams,
  parseCreateSpaceRoleParams,
  parseSetClassCollaboratorMetadataParams,
  parseUpdateHulyPermissionParams,
  updateHulyPermissionParamsJsonSchema
} from "../../src/domain/schemas/security-administration.js"

describe("security administration schemas", () => {
  it.effect("requires explicit confirmation for every metadata write", () =>
    Effect.gen(function* () {
      const permission = yield* parseCreateHulyPermissionParams({ label: "Export", scope: "workspace" }).pipe(
        Effect.exit
      )
      const role = yield* parseCreateSpaceRoleParams({
        spaceType: "Default Trainings",
        name: "Auditor",
        permissions: []
      }).pipe(Effect.exit)

      expect(Exit.isFailure(permission)).toBe(true)
      expect(Exit.isFailure(role)).toBe(true)
    })
  )

  it.effect("parses name-addressed permissions, roles, classes, and fields", () =>
    Effect.gen(function* () {
      const permission = yield* parseCreateHulyPermissionParams({
        label: "Review training",
        scope: "space",
        objectClass: "Training",
        transaction: "update",
        confirm: true
      })
      const role = yield* parseCreateSpaceRoleParams({
        spaceType: "Default Trainings",
        name: "Reviewer",
        permissions: ["Review training"],
        confirm: true
      })
      const collaborators = yield* parseSetClassCollaboratorMetadataParams({
        class: "Issue",
        fieldSelection: { mode: "fields", fields: ["assignee", "createdBy"] },
        provideSecurity: true,
        confirm: true
      })

      expect(permission).toMatchObject({ objectClass: "Training", transaction: "update" })
      expect(role.permissions).toEqual(["Review training"])
      expect(collaborators.fieldSelection).toEqual({ mode: "fields", fields: ["assignee", "createdBy"] })
    })
  )

  it.effect("rejects duplicate permission and collaborator field identifiers", () =>
    Effect.gen(function* () {
      const role = yield* parseCreateSpaceRoleParams({
        spaceType: "Training",
        name: "Reviewer",
        permissions: ["Review", "review"],
        confirm: true
      }).pipe(Effect.exit)
      const collaborators = yield* parseSetClassCollaboratorMetadataParams({
        class: "Issue",
        fieldSelection: { mode: "fields", fields: ["assignee", "Assignee"] },
        confirm: true
      }).pipe(Effect.exit)

      expect(Exit.isFailure(role)).toBe(true)
      expect(Exit.isFailure(collaborators)).toBe(true)
    })
  )

  it.effect("rejects empty permission updates and advertises update fields", () =>
    Effect.gen(function* () {
      const exit = yield* parseUpdateHulyPermissionParams({ permission: "Review", confirm: true }).pipe(Effect.exit)
      const descriptionOnly = yield* parseUpdateHulyPermissionParams({
        permission: "Review",
        description: "Updated description",
        confirm: true
      })
      expect(Exit.isFailure(exit)).toBe(true)
      expect(descriptionOnly.description).toBe("Updated description")
      expect(updateHulyPermissionParamsJsonSchema).toHaveProperty("anyOf")
    })
  )
})
