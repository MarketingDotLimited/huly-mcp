import { describe, it } from "@effect/vitest"
import { Effect, Exit } from "effect"
import { expect } from "vitest"

import {
  parseCreateHulyAttributeParams,
  parseCreateHulyEnumParams,
  parseUpdateHulyAttributeParams,
  parseUpdateHulyEnumParams,
  updateHulyAttributeParamsJsonSchema,
  updateHulyEnumParamsJsonSchema
} from "../../src/domain/schemas/model-administration.js"

describe("model administration schemas", () => {
  it.effect("requires explicit confirmation for model writes", () =>
    Effect.gen(function* () {
      const exit = yield* parseCreateHulyEnumParams({ name: "Priority", values: ["Low"] }).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
    })
  )

  it.effect("rejects case-insensitive duplicate enum options", () =>
    Effect.gen(function* () {
      const exit = yield* parseCreateHulyEnumParams({ name: "Priority", values: ["Low", "low"], confirm: true }).pipe(
        Effect.exit
      )
      expect(Exit.isFailure(exit)).toBe(true)
    })
  )

  it.effect("parses name-addressed enum and class-addressed attribute writes", () =>
    Effect.gen(function* () {
      const enumUpdate = yield* parseUpdateHulyEnumParams({ enum: "Priority", values: ["Low", "High"], confirm: true })
      const attribute = yield* parseCreateHulyAttributeParams({
        class: "Issue",
        name: "priority",
        label: "Priority",
        type: { kind: "enum", enum: "Priority" },
        hidden: false,
        confirm: true
      })
      expect(enumUpdate.enum).toBe("Priority")
      expect(attribute.type).toEqual({ kind: "enum", enum: "Priority" })
    })
  )

  it.effect("rejects empty updates and advertises update fields", () =>
    Effect.gen(function* () {
      const enumExit = yield* parseUpdateHulyEnumParams({ enum: "Priority", confirm: true }).pipe(Effect.exit)
      const attributeExit = yield* parseUpdateHulyAttributeParams({ attribute: "priority", confirm: true }).pipe(
        Effect.exit
      )
      expect(Exit.isFailure(enumExit)).toBe(true)
      expect(Exit.isFailure(attributeExit)).toBe(true)
      expect(updateHulyEnumParamsJsonSchema).toHaveProperty("anyOf")
      expect(updateHulyAttributeParamsJsonSchema).toHaveProperty("anyOf")
    })
  )

  it.effect("accepts each boolean side of attribute visibility updates", () =>
    Effect.gen(function* () {
      const hidden = yield* parseUpdateHulyAttributeParams({ attribute: "priority", hidden: true, confirm: true })
      const visible = yield* parseUpdateHulyAttributeParams({ attribute: "priority", hidden: false, confirm: true })
      expect(hidden.hidden).toBe(true)
      expect(visible.hidden).toBe(false)
    })
  )
})
