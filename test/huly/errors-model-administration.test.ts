import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import { ModelIdentifier } from "../../src/domain/schemas/model-administration.js"
import { HulyAttributeId, HulyEnumId, NonEmptyString, ObjectClassName } from "../../src/domain/schemas/shared.js"
import {
  HulyAttributeAmbiguousError,
  HulyAttributeInUseError,
  HulyAttributeNameConflictError,
  HulyAttributeNotFoundError,
  HulyAttributeProtectedError,
  HulyEnumAmbiguousError,
  HulyEnumInUseError,
  HulyEnumNameConflictError,
  HulyEnumNotFoundError,
  HulyEnumOptionsInUseError,
  ModelClassAmbiguousError,
  ModelClassNotFoundError
} from "../../src/huly/errors-model-administration.js"

const attributeId = HulyAttributeId.make("attribute:priority")
const otherAttributeId = HulyAttributeId.make("attribute:other")
const enumId = HulyEnumId.make("enum:priority")
const classId = ObjectClassName.make("tracker:class:Issue")

describe("model administration errors", () => {
  it.effect("renders actionable model resolver and guard messages", () =>
    Effect.sync(() => {
      const messages = [
        new ModelClassNotFoundError({ identifier: ModelIdentifier.make("Missing") }).message,
        new ModelClassAmbiguousError({
          identifier: ModelIdentifier.make("Issue"),
          matches: [NonEmptyString.make("a:class:Issue"), NonEmptyString.make("b:class:Issue")]
        }).message,
        new HulyEnumNotFoundError({ identifier: ModelIdentifier.make("Missing") }).message,
        new HulyEnumAmbiguousError({
          identifier: ModelIdentifier.make("Priority"),
          matches: [NonEmptyString.make("enum:a"), NonEmptyString.make("enum:b")]
        }).message,
        new HulyEnumNameConflictError({ name: NonEmptyString.make("Priority"), existingEnumId: enumId }).message,
        new HulyEnumOptionsInUseError({ enumId, attributeIds: [attributeId] }).message,
        new HulyEnumInUseError({ enumId, attributeIds: [attributeId] }).message,
        new HulyAttributeNotFoundError({ identifier: NonEmptyString.make("missing") }).message,
        new HulyAttributeAmbiguousError({
          identifier: NonEmptyString.make("priority"),
          matches: [attributeId, otherAttributeId]
        }).message,
        new HulyAttributeNameConflictError({
          name: NonEmptyString.make("priority"),
          ownerClassId: classId,
          existingAttributeId: attributeId
        }).message,
        new HulyAttributeProtectedError({ attributeId }).message,
        new HulyAttributeInUseError({ attributeId, ownerClassId: classId, name: NonEmptyString.make("priority") })
          .message
      ]
      expect(messages.every((message) => message.length > 20)).toBe(true)
      expect(messages.join("\n")).toContain("list_huly_classes")
      expect(messages.join("\n")).toContain("isCustom=true")
      expect(messages.join("\n")).toContain("cannot be deleted")
    })
  )
})
