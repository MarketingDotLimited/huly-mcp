import { Schema } from "effect"

import { HulyAttributeId, HulyEnumId, NonEmptyString, ObjectClassName } from "../domain/schemas/shared.js"

const MINIMUM_AMBIGUOUS_MATCHES = 2
const IdentifierMatchesSchema = Schema.Array(NonEmptyString).check(Schema.isMinLength(MINIMUM_AMBIGUOUS_MATCHES))

export class ModelClassNotFoundError extends Schema.TaggedError<ModelClassNotFoundError>()("ModelClassNotFoundError", {
  identifier: NonEmptyString
}) {
  override get message(): string {
    return `Huly class '${this.identifier}' not found; use list_huly_classes to discover an exact class ID or name`
  }
}

export class ModelClassAmbiguousError extends Schema.TaggedError<ModelClassAmbiguousError>()(
  "ModelClassAmbiguousError",
  { identifier: NonEmptyString, matches: IdentifierMatchesSchema }
) {
  override get message(): string {
    return `Huly class '${this.identifier}' is ambiguous; pass one of these exact IDs: ${this.matches.join(", ")}`
  }
}

export class HulyEnumNotFoundError extends Schema.TaggedError<HulyEnumNotFoundError>()("HulyEnumNotFoundError", {
  identifier: NonEmptyString
}) {
  override get message(): string {
    return `Huly enum '${this.identifier}' not found; use list_huly_enums to discover an exact enum ID or name`
  }
}

export class HulyEnumAmbiguousError extends Schema.TaggedError<HulyEnumAmbiguousError>()("HulyEnumAmbiguousError", {
  identifier: NonEmptyString,
  matches: IdentifierMatchesSchema
}) {
  override get message(): string {
    return `Huly enum '${this.identifier}' is ambiguous; pass one of these exact IDs: ${this.matches.join(", ")}`
  }
}

export class HulyEnumNameConflictError extends Schema.TaggedError<HulyEnumNameConflictError>()(
  "HulyEnumNameConflictError",
  { name: NonEmptyString, existingEnumId: HulyEnumId }
) {
  override get message(): string {
    return `Huly enum name '${this.name}' is already used by '${this.existingEnumId}'`
  }
}

export class HulyEnumOptionsInUseError extends Schema.TaggedError<HulyEnumOptionsInUseError>()(
  "HulyEnumOptionsInUseError",
  { enumId: HulyEnumId, attributeIds: Schema.Array(HulyAttributeId).check(Schema.isNonEmpty()) }
) {
  override get message(): string {
    return `Huly enum '${this.enumId}' is referenced by attributes ${this.attributeIds.join(", ")}; options may be added, but existing options cannot be removed while referenced`
  }
}

export class HulyEnumInUseError extends Schema.TaggedError<HulyEnumInUseError>()("HulyEnumInUseError", {
  enumId: HulyEnumId,
  attributeIds: Schema.Array(HulyAttributeId).check(Schema.isNonEmpty())
}) {
  override get message(): string {
    return `Huly enum '${this.enumId}' cannot be deleted because attributes reference it: ${this.attributeIds.join(", ")}`
  }
}

export class HulyAttributeNotFoundError extends Schema.TaggedError<HulyAttributeNotFoundError>()(
  "HulyAttributeNotFoundError",
  { identifier: NonEmptyString }
) {
  override get message(): string {
    return `Huly attribute '${this.identifier}' not found; use list_huly_attributes to discover an exact attribute ID or name`
  }
}

export class HulyAttributeAmbiguousError extends Schema.TaggedError<HulyAttributeAmbiguousError>()(
  "HulyAttributeAmbiguousError",
  {
    identifier: NonEmptyString,
    matches: Schema.Array(HulyAttributeId).check(Schema.isMinLength(MINIMUM_AMBIGUOUS_MATCHES))
  }
) {
  override get message(): string {
    return `Huly attribute '${this.identifier}' is ambiguous; pass an exact ID or class. Matches: ${this.matches.join(", ")}`
  }
}

export class HulyAttributeNameConflictError extends Schema.TaggedError<HulyAttributeNameConflictError>()(
  "HulyAttributeNameConflictError",
  { name: NonEmptyString, ownerClassId: ObjectClassName, existingAttributeId: HulyAttributeId }
) {
  override get message(): string {
    return `Attribute name '${this.name}' already exists on class '${this.ownerClassId}' (${this.existingAttributeId})`
  }
}

export class HulyAttributeProtectedError extends Schema.TaggedError<HulyAttributeProtectedError>()(
  "HulyAttributeProtectedError",
  { attributeId: HulyAttributeId }
) {
  override get message(): string {
    return `Attribute '${this.attributeId}' is not marked isCustom=true; built-in model attributes only permit hidden-state updates through this safe administration surface`
  }
}

export class HulyAttributeInUseError extends Schema.TaggedError<HulyAttributeInUseError>()("HulyAttributeInUseError", {
  attributeId: HulyAttributeId,
  ownerClassId: ObjectClassName,
  name: NonEmptyString
}) {
  override get message(): string {
    return `Attribute '${this.attributeId}' cannot be deleted because at least one '${this.ownerClassId}' document has property '${this.name}'`
  }
}

export const ModelAdministrationDomainError = Schema.Union([
  ModelClassNotFoundError,
  ModelClassAmbiguousError,
  HulyEnumNotFoundError,
  HulyEnumAmbiguousError,
  HulyEnumNameConflictError,
  HulyEnumOptionsInUseError,
  HulyEnumInUseError,
  HulyAttributeNotFoundError,
  HulyAttributeAmbiguousError,
  HulyAttributeNameConflictError,
  HulyAttributeProtectedError,
  HulyAttributeInUseError
])
