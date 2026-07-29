/**
 * Generic space, space type, role, and permission domain errors.
 *
 * @module
 */
import { Schema } from "effect"

import { NonEmptyString, ObjectClassName, RoleId, SpaceId, SpaceTypeId } from "../domain/schemas/shared.js"

const MIN_AMBIGUOUS_SPACE_MATCHES = 2

const AmbiguousSpaceMatchSchema = Schema.Struct({
  id: SpaceId,
  name: NonEmptyString,
  class: ObjectClassName,
  type: Schema.optional(SpaceTypeId)
})

const AmbiguousSpaceTypeMatchSchema = Schema.Struct({
  id: SpaceTypeId,
  name: NonEmptyString,
  targetClass: ObjectClassName
})

const AmbiguousSpaceRoleMatchSchema = Schema.Struct({ id: RoleId, name: NonEmptyString })

export class SpaceNotFoundError extends Schema.TaggedError<SpaceNotFoundError>()("SpaceNotFoundError", {
  identifier: NonEmptyString
}) {
  override get message(): string {
    return `Space '${this.identifier}' not found`
  }
}

export class SpaceIdentifierAmbiguousError extends Schema.TaggedError<SpaceIdentifierAmbiguousError>()(
  "SpaceIdentifierAmbiguousError",
  {
    identifier: NonEmptyString,
    matches: Schema.Array(AmbiguousSpaceMatchSchema).pipe(Schema.minItems(MIN_AMBIGUOUS_SPACE_MATCHES))
  }
) {
  override get message(): string {
    const details = this.matches
      .map((match) => `${match.id} (${match.class}${match.type === undefined ? "" : `, type ${match.type}`})`)
      .join(", ")
    return `Space '${this.identifier}' is ambiguous; use a space id or narrow by class/type. Matches: ${details}`
  }
}

export class SpaceTypeNotFoundError extends Schema.TaggedError<SpaceTypeNotFoundError>()("SpaceTypeNotFoundError", {
  identifier: NonEmptyString
}) {
  override get message(): string {
    return `Space type '${this.identifier}' not found`
  }
}

export class SpaceTypeIdentifierAmbiguousError extends Schema.TaggedError<SpaceTypeIdentifierAmbiguousError>()(
  "SpaceTypeIdentifierAmbiguousError",
  {
    identifier: NonEmptyString,
    matches: Schema.Array(AmbiguousSpaceTypeMatchSchema).pipe(Schema.minItems(MIN_AMBIGUOUS_SPACE_MATCHES))
  }
) {
  override get message(): string {
    const details = this.matches.map((match) => `${match.id} (${match.targetClass})`).join(", ")
    return `Space type '${this.identifier}' is ambiguous; use a space type id. Matches: ${details}`
  }
}

export class SpaceNotTypedError extends Schema.TaggedError<SpaceNotTypedError>()("SpaceNotTypedError", {
  id: SpaceId,
  name: NonEmptyString
}) {
  override get message(): string {
    return `Space '${this.name}' (${this.id}) is not typed; role members can only be changed on spaces with a SpaceType`
  }
}

export class SpaceRoleNotFoundError extends Schema.TaggedError<SpaceRoleNotFoundError>()("SpaceRoleNotFoundError", {
  identifier: NonEmptyString,
  spaceType: SpaceTypeId
}) {
  override get message(): string {
    return `Role '${this.identifier}' not found in space type '${this.spaceType}'`
  }
}

export class SpaceRoleIdentifierAmbiguousError extends Schema.TaggedError<SpaceRoleIdentifierAmbiguousError>()(
  "SpaceRoleIdentifierAmbiguousError",
  {
    identifier: NonEmptyString,
    spaceType: SpaceTypeId,
    matches: Schema.Array(AmbiguousSpaceRoleMatchSchema).pipe(Schema.minItems(MIN_AMBIGUOUS_SPACE_MATCHES))
  }
) {
  override get message(): string {
    const details = this.matches.map((match) => `${match.id} (${match.name})`).join(", ")
    return `Role '${this.identifier}' is ambiguous in space type '${this.spaceType}'; use a role id. Matches: ${details}`
  }
}

export class SpaceRoleAssignmentsMalformedError extends Schema.TaggedError<SpaceRoleAssignmentsMalformedError>()(
  "SpaceRoleAssignmentsMalformedError",
  { space: SpaceId, spaceType: SpaceTypeId, targetClass: ObjectClassName, reason: NonEmptyString }
) {
  override get message(): string {
    return `Role assignments for space '${this.space}' and space type '${this.spaceType}' are malformed at '${this.targetClass}': ${this.reason}. Refusing to write role members to avoid access-control data loss.`
  }
}
