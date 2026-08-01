import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import { HulySequenceId, HulySequenceValue } from "../../src/domain/schemas/sdk-discovery-configurations.js"
import { SequenceIdentifier } from "../../src/domain/schemas/sequence-administration.js"
import { HulyAttributeId, ObjectClassName } from "../../src/domain/schemas/shared.js"
import {
  SequenceConcurrentWriteError,
  SequenceCurrentValueMismatchError,
  SequenceDefinitionConflictError,
  SequenceIdentifierAmbiguousError,
  SequenceInUseError,
  SequenceKindUnsupportedError,
  SequenceNotFoundError
} from "../../src/huly/errors-sequence-administration.js"

describe("sequence administration errors", () => {
  it.effect("gives an LLM actionable conflict and resolution guidance", () =>
    Effect.sync(() => {
      const sequenceId = HulySequenceId.make("sequence-1")
      expect(
        new SequenceDefinitionConflictError({
          classId: ObjectClassName.make("tracker:class:Issue"),
          existingSequenceId: sequenceId
        }).message
      ).toContain("different sequence kind or custom prefix")
      expect(new SequenceConcurrentWriteError({ operation: "delete", sequenceId }).message).toContain(
        "inspect list_huly_sequences"
      )
      expect(new SequenceNotFoundError({ identifier: SequenceIdentifier.make("Missing") }).message).toContain(
        "use list_huly_sequences"
      )
      expect(
        new SequenceIdentifierAmbiguousError({
          identifier: SequenceIdentifier.make("Issue"),
          matches: [sequenceId, HulySequenceId.make("sequence-2")]
        }).message
      ).toContain("pass one of these exact IDs")
    })
  )

  it.effect("explains protected kinds, stale values, and identifier references", () =>
    Effect.sync(() => {
      const sequenceId = HulySequenceId.make("sequence-1")
      expect(new SequenceKindUnsupportedError({ sequenceId }).message).toContain("only for core CustomSequence")
      expect(
        new SequenceCurrentValueMismatchError({
          sequenceId,
          expected: HulySequenceValue.make(1),
          actual: HulySequenceValue.make(2)
        }).message
      ).toContain("not expected value 1")
      expect(
        new SequenceInUseError({ sequenceId, attributeIds: [HulyAttributeId.make("attribute-1")] }).message
      ).toContain("identifier attributes reference it")
    })
  )
})
