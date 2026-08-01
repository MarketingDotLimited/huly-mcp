import { describe, it } from "@effect/vitest"
import { Effect, Exit } from "effect"
import { expect } from "vitest"

import {
  parseCreateHulySequenceParams,
  parseDeleteHulySequenceParams,
  parseUpdateHulyCustomSequenceParams
} from "../../src/domain/schemas/sequence-administration.js"

describe("sequence administration schemas", () => {
  it.effect("parses guarded standard and custom sequence creation without a mutable counter value", () =>
    Effect.gen(function* () {
      const standard = yield* parseCreateHulySequenceParams({ class: "Issue", kind: "standard", confirm: true })
      const custom = yield* parseCreateHulySequenceParams({
        class: "Issue",
        kind: "custom",
        prefix: "ISSUE",
        confirm: true
      })
      const mutableCounter = yield* parseCreateHulySequenceParams({
        class: "Issue",
        kind: "standard",
        currentValue: 41,
        confirm: true
      }).pipe(Effect.exit)

      expect(standard).toEqual({ class: "Issue", kind: "standard", confirm: true })
      expect(custom).toEqual({ class: "Issue", kind: "custom", prefix: "ISSUE", confirm: true })
      expect(Exit.isFailure(mutableCounter)).toBe(true)
    })
  )

  it.effect("requires confirmation and a prefix-only custom update", () =>
    Effect.gen(function* () {
      const update = yield* parseUpdateHulyCustomSequenceParams({
        sequence: "sequence-1",
        prefix: "TASK",
        confirm: true
      })
      const missingConfirmation = yield* parseDeleteHulySequenceParams({
        sequence: "sequence-1",
        expectedCurrentValue: 0
      }).pipe(Effect.exit)
      const counterUpdate = yield* parseUpdateHulyCustomSequenceParams({
        sequence: "sequence-1",
        prefix: "TASK",
        currentValue: 9,
        confirm: true
      }).pipe(Effect.exit)
      const activeSequenceDeletion = yield* parseDeleteHulySequenceParams({
        sequence: "sequence-1",
        expectedCurrentValue: 1,
        confirm: true
      }).pipe(Effect.exit)

      expect(update).toEqual({ sequence: "sequence-1", prefix: "TASK", confirm: true })
      expect(Exit.isFailure(missingConfirmation)).toBe(true)
      expect(Exit.isFailure(counterUpdate)).toBe(true)
      expect(Exit.isFailure(activeSequenceDeletion)).toBe(true)
    })
  )
})
