import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import {
  ClassCollaboratorMetadataId,
  CollaboratorFieldName,
  PermissionIdentifier
} from "../../src/domain/schemas/security-administration.js"
import { NonEmptyString, ObjectClassName, PermissionId, SpaceTypeId } from "../../src/domain/schemas/shared.js"
import {
  ClassCollaboratorMetadataNotFoundError,
  CollaboratorFieldNotFoundError,
  CollaboratorMetadataAmbiguousError,
  PermissionIdentifierAmbiguousError,
  PermissionInUseError,
  PermissionLabelConflictError,
  PermissionNotFoundError,
  PermissionProtectedError,
  SpaceRoleNameConflictError,
  SpaceRolePermissionScopeError,
  SpaceRoleWriteUnsupportedError
} from "../../src/huly/errors-security-administration.js"

describe("security administration errors", () => {
  it.effect("renders actionable messages for every refusal", () =>
    Effect.sync(() => {
      const permissionId = PermissionId.make("permission-a")
      const messages = [
        new PermissionNotFoundError({ identifier: PermissionIdentifier.make("missing") }).message,
        new PermissionIdentifierAmbiguousError({
          identifier: PermissionIdentifier.make("duplicate"),
          matches: [permissionId, PermissionId.make("permission-b")]
        }).message,
        new PermissionLabelConflictError({
          label: NonEmptyString.make("Duplicate"),
          existingPermissionId: permissionId
        }).message,
        new PermissionProtectedError({ permissionId }).message,
        new PermissionInUseError({ permissionId, references: [NonEmptyString.make("role:reviewer")] }).message,
        new SpaceRoleNameConflictError({
          name: NonEmptyString.make("Reviewer"),
          spaceTypeId: SpaceTypeId.make("space-type")
        }).message,
        new SpaceRoleWriteUnsupportedError({ operation: NonEmptyString.make("removeCollection") }).message,
        new SpaceRolePermissionScopeError({ permissionId, spaceTypeId: SpaceTypeId.make("space-type") }).message,
        new CollaboratorMetadataAmbiguousError({
          classId: ObjectClassName.make("class:issue"),
          metadataIds: [ClassCollaboratorMetadataId.make("metadata-a"), ClassCollaboratorMetadataId.make("metadata-b")]
        }).message,
        new CollaboratorFieldNotFoundError({
          classId: ObjectClassName.make("class:issue"),
          fields: [CollaboratorFieldName.make("missing")]
        }).message,
        new ClassCollaboratorMetadataNotFoundError({ classId: ObjectClassName.make("class:issue") }).message
      ]

      expect(messages).toHaveLength(11)
      expect(messages.every((message) => message.length > 20)).toBe(true)
    })
  )
})
