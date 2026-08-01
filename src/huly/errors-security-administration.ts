import { Schema } from "effect"

import {
  ClassCollaboratorMetadataId,
  CollaboratorFieldName,
  PermissionIdentifier
} from "../domain/schemas/security-administration.js"
import { NonEmptyString, ObjectClassName, PermissionId, SpaceTypeId } from "../domain/schemas/shared.js"

const MINIMUM_AMBIGUOUS_MATCHES = 2

export class PermissionNotFoundError extends Schema.TaggedError<PermissionNotFoundError>()("PermissionNotFoundError", {
  identifier: PermissionIdentifier
}) {
  override get message(): string {
    return `Permission '${this.identifier}' not found; use list_space_permissions to discover an exact ID or label`
  }
}

export class PermissionIdentifierAmbiguousError extends Schema.TaggedError<PermissionIdentifierAmbiguousError>()(
  "PermissionIdentifierAmbiguousError",
  {
    identifier: PermissionIdentifier,
    matches: Schema.Array(PermissionId).pipe(Schema.minItems(MINIMUM_AMBIGUOUS_MATCHES))
  }
) {
  override get message(): string {
    return `Permission '${this.identifier}' is ambiguous; pass one of these exact IDs: ${this.matches.join(", ")}`
  }
}

export class PermissionLabelConflictError extends Schema.TaggedError<PermissionLabelConflictError>()(
  "PermissionLabelConflictError",
  { label: NonEmptyString, existingPermissionId: PermissionId }
) {
  override get message(): string {
    return `Permission label '${this.label}' is already used by '${this.existingPermissionId}' with a different definition`
  }
}

export class PermissionProtectedError extends Schema.TaggedError<PermissionProtectedError>()(
  "PermissionProtectedError",
  { permissionId: PermissionId }
) {
  override get message(): string {
    return `Permission '${this.permissionId}' has a namespaced built-in ID and cannot be updated or deleted through the safe administration surface`
  }
}

export class PermissionKindUnsupportedError extends Schema.TaggedError<PermissionKindUnsupportedError>()(
  "PermissionKindUnsupportedError",
  { permissionId: PermissionId, actualClass: ObjectClassName }
) {
  override get message(): string {
    return `Permission '${this.permissionId}' is a specialized '${this.actualClass}' definition; only direct core Permission records are supported`
  }
}

export class PermissionInUseError extends Schema.TaggedError<PermissionInUseError>()("PermissionInUseError", {
  permissionId: PermissionId,
  references: Schema.Array(NonEmptyString).pipe(Schema.minItems(1))
}) {
  override get message(): string {
    return `Permission '${this.permissionId}' is referenced by ${this.references.join(", ")}; structural updates and deletion are refused`
  }
}

export class SpaceRoleNameConflictError extends Schema.TaggedError<SpaceRoleNameConflictError>()(
  "SpaceRoleNameConflictError",
  { name: NonEmptyString, spaceTypeId: SpaceTypeId }
) {
  override get message(): string {
    return `Role name '${this.name}' already exists in space type '${this.spaceTypeId}' with different permissions`
  }
}

export class SpaceRoleWriteUnsupportedError extends Schema.TaggedError<SpaceRoleWriteUnsupportedError>()(
  "SpaceRoleWriteUnsupportedError",
  { operation: NonEmptyString }
) {
  override get message(): string {
    return `Huly client does not support '${this.operation}'; refusing a partial role-definition write`
  }
}

export class SpaceRolePermissionScopeError extends Schema.TaggedError<SpaceRolePermissionScopeError>()(
  "SpaceRolePermissionScopeError",
  { permissionId: PermissionId, spaceTypeId: SpaceTypeId }
) {
  override get message(): string {
    return `Workspace-scoped permission '${this.permissionId}' can only be assigned to the stable all-spaces SpaceType, not '${this.spaceTypeId}'`
  }
}

export class CollaboratorMetadataAmbiguousError extends Schema.TaggedError<CollaboratorMetadataAmbiguousError>()(
  "CollaboratorMetadataAmbiguousError",
  {
    classId: ObjectClassName,
    metadataIds: Schema.Array(ClassCollaboratorMetadataId).pipe(Schema.minItems(MINIMUM_AMBIGUOUS_MATCHES))
  }
) {
  override get message(): string {
    return `Class '${this.classId}' has multiple collaborator metadata records (${this.metadataIds.join(", ")}); refusing to choose one`
  }
}

export class CollaboratorFieldNotFoundError extends Schema.TaggedError<CollaboratorFieldNotFoundError>()(
  "CollaboratorFieldNotFoundError",
  { classId: ObjectClassName, fields: Schema.Array(CollaboratorFieldName).pipe(Schema.minItems(1)) }
) {
  override get message(): string {
    return `Class '${this.classId}' does not expose collaborator fields: ${this.fields.join(", ")}; use list_huly_attributes for exact property names`
  }
}

export class ClassCollaboratorMetadataNotFoundError extends Schema.TaggedError<ClassCollaboratorMetadataNotFoundError>()(
  "ClassCollaboratorMetadataNotFoundError",
  { classId: ObjectClassName }
) {
  override get message(): string {
    return `Class '${this.classId}' has no direct class collaborator metadata record`
  }
}

export const SecurityAdministrationDomainError = Schema.Union(
  PermissionNotFoundError,
  PermissionIdentifierAmbiguousError,
  PermissionLabelConflictError,
  PermissionProtectedError,
  PermissionKindUnsupportedError,
  PermissionInUseError,
  SpaceRoleNameConflictError,
  SpaceRoleWriteUnsupportedError,
  SpaceRolePermissionScopeError,
  CollaboratorMetadataAmbiguousError,
  CollaboratorFieldNotFoundError,
  ClassCollaboratorMetadataNotFoundError
)
