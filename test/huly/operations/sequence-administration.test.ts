import { describe, it } from "@effect/vitest"
import type { AnyAttribute, CustomSequence, Sequence, TypeIdentifier } from "@hcengineering/core"
import { ClassifierKind, toFindResult } from "@hcengineering/core"
import { Effect, Exit } from "effect"
import { expect } from "vitest"

import { ModelIdentifier } from "../../../src/domain/schemas/model-administration.js"
import { SequenceIdentifier } from "../../../src/domain/schemas/sequence-administration.js"
import { HulySequencePrefix, HulySequenceValue } from "../../../src/domain/schemas/sdk-discovery-configurations.js"
import type { HulyConditionalWriteResult } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { core, tracker } from "../../../src/huly/huly-plugins.js"
import {
  createHulySequence,
  deleteHulySequence,
  updateHulyCustomSequence
} from "../../../src/huly/operations/sequence-administration.js"
import type { MetadataClassDoc } from "../../../src/huly/operations/sdk-discovery-mappers.js"
import { toRef } from "../../../src/huly/operations/sdk-boundary.js"
import { corePersonId } from "../../helpers/huly-sdk.js"

const person = corePersonId("person-1")
const space = core.space.Workspace

const modelClass: MetadataClassDoc = {
  _id: tracker.class.Issue,
  _class: core.class.Class,
  space: core.space.Model,
  modifiedBy: person,
  modifiedOn: 0,
  label: "tracker:class:Issue",
  kind: ClassifierKind.CLASS,
  domain: "tracker"
}

const sequence = (value: HulySequenceValue): Sequence => ({
  _id: toRef<Sequence>("sequence-issue"),
  _class: core.class.Sequence,
  space,
  modifiedBy: person,
  modifiedOn: 0,
  attachedTo: tracker.class.Issue,
  sequence: value
})

const customSequence = (
  value: HulySequenceValue,
  prefix: HulySequencePrefix = HulySequencePrefix.make("ISSUE")
): CustomSequence => ({
  ...sequence(value),
  _id: toRef<CustomSequence>("sequence-custom"),
  _class: core.class.CustomSequence,
  prefix
})

const identifierAttribute = (): AnyAttribute => {
  const type: TypeIdentifier = {
    _class: core.class.TypeIdentifier,
    label: core.string.String,
    of: toRef<CustomSequence>("sequence-custom")
  }
  return {
    _id: toRef<AnyAttribute>("attribute-identifier"),
    _class: core.class.Attribute,
    space: core.space.Model,
    modifiedBy: person,
    modifiedOn: 0,
    name: "identifier",
    label: core.string.String,
    attributeOf: tracker.class.Issue,
    type,
    isCustom: true
  }
}

const unrelatedAttribute = (): AnyAttribute => ({
  _id: toRef<AnyAttribute>("attribute-title"),
  _class: core.class.Attribute,
  space: core.space.Model,
  modifiedBy: person,
  modifiedOn: 0,
  name: "title",
  label: core.string.String,
  attributeOf: tracker.class.Issue,
  type: { _class: core.class.TypeString, label: core.string.String },
  isCustom: true
})

type AtomicOperationsConfig =
  | {
      readonly kind: "available"
      readonly createResult?: HulyConditionalWriteResult
      readonly updateResult?: HulyConditionalWriteResult
      readonly removeResult?: HulyConditionalWriteResult
    }
  | { readonly kind: "missing"; readonly operation: "create" | "update" | "remove" }

interface HarnessConfig {
  readonly sequences?: ReadonlyArray<Sequence>
  readonly customSequences?: ReadonlyArray<CustomSequence>
  readonly attributes?: ReadonlyArray<AnyAttribute>
  readonly atomic?: AtomicOperationsConfig
}

const testLayer = (config: HarnessConfig, writes: Array<unknown>) => {
  const atomic = config.atomic ?? { kind: "available" }
  // Runtime class-ref dispatch proves which fixture collection has T. TypeScript cannot narrow a generic from Ref<Class<T>>.
  const findAll: HulyClientOperations["findAll"] = ((_class: unknown) => {
    if (_class === core.class.Sequence) return Effect.succeed(toFindResult([...(config.sequences ?? [])]))
    if (_class === core.class.CustomSequence) {
      return Effect.succeed(toFindResult([...(config.customSequences ?? [])]))
    }
    if (_class === core.class.Attribute) return Effect.succeed(toFindResult([...(config.attributes ?? [])]))
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]
  // The model fixture is a Class document; the SDK's generic callback cannot infer that fixed T from this stub.
  const findAllInModel: HulyClientOperations["findAllInModel"] = (() =>
    Effect.succeed(toFindResult([modelClass]))) as HulyClientOperations["findAllInModel"]
  // These stubs observe boundary payloads only; SDK generics are erased and cannot be expressed by a non-generic recorder.
  const createDocIfNotMatched: NonNullable<HulyClientOperations["createDocIfNotMatched"]> = ((
    _class: unknown,
    _space: unknown,
    attributes: unknown
  ) => {
    writes.push(attributes)
    return Effect.succeed(atomic.kind === "available" ? (atomic.createResult ?? "applied") : "applied")
  }) as NonNullable<HulyClientOperations["createDocIfNotMatched"]>
  // See the boundary-recorder justification above; this recorder does not construct or reinterpret T.
  const updateDocIfMatched: NonNullable<HulyClientOperations["updateDocIfMatched"]> = ((
    _class: unknown,
    _space: unknown,
    _id: unknown,
    matchQuery: unknown,
    operations: unknown
  ) => {
    writes.push({ matchQuery, operations })
    return Effect.succeed(atomic.kind === "available" ? (atomic.updateResult ?? "applied") : "applied")
  }) as NonNullable<HulyClientOperations["updateDocIfMatched"]>
  // See the boundary-recorder justification above; this recorder does not construct or reinterpret T.
  const removeDocIfMatched: NonNullable<HulyClientOperations["removeDocIfMatched"]> = ((
    _class: unknown,
    _space: unknown,
    _id: unknown,
    matchQuery: unknown
  ) => {
    writes.push({ matchQuery })
    return Effect.succeed(atomic.kind === "available" ? (atomic.removeResult ?? "applied") : "applied")
  }) as NonNullable<HulyClientOperations["removeDocIfMatched"]>
  const conditionalOverrides: Partial<HulyClientOperations> = {
    createDocIfNotMatched,
    updateDocIfMatched,
    removeDocIfMatched
  }
  if (atomic.kind === "missing" && atomic.operation === "create") {
    Object.defineProperty(conditionalOverrides, "createDocIfNotMatched", { value: undefined, enumerable: true })
  }
  if (atomic.kind === "missing" && atomic.operation === "update") {
    Object.defineProperty(conditionalOverrides, "updateDocIfMatched", { value: undefined, enumerable: true })
  }
  if (atomic.kind === "missing" && atomic.operation === "remove") {
    Object.defineProperty(conditionalOverrides, "removeDocIfMatched", { value: undefined, enumerable: true })
  }
  return HulyClient.testLayer({ findAll, findAllInModel, ...conditionalOverrides })
}

describe("sequence administration", () => {
  it.effect("creates a zero-valued standard sequence and leaves a retry's advanced counter untouched", () =>
    Effect.gen(function* () {
      const writes: Array<unknown> = []
      const created = yield* createHulySequence({
        class: ModelIdentifier.make("Issue"),
        kind: "standard",
        confirm: true
      }).pipe(Effect.provide(testLayer({}, writes)))
      const retried = yield* createHulySequence({
        class: ModelIdentifier.make("Issue"),
        kind: "standard",
        confirm: true
      }).pipe(Effect.provide(testLayer({ sequences: [sequence(HulySequenceValue.make(41))] }, writes)))

      expect(created.sequence).toMatchObject({ attachedClass: tracker.class.Issue, currentValue: 0 })
      expect(created.created).toBe(true)
      expect(retried).toEqual({
        sequence: { sequenceId: "sequence-issue", attachedClass: tracker.class.Issue, currentValue: 41 },
        created: false
      })
      expect(writes).toEqual([{ attachedTo: tracker.class.Issue, sequence: 0 }])
    })
  )

  it.effect("creates and idempotently retries a custom sequence while rejecting incompatible definitions", () =>
    Effect.gen(function* () {
      const writes: Array<unknown> = []
      const created = yield* createHulySequence({
        class: ModelIdentifier.make("Issue"),
        kind: "custom",
        prefix: HulySequencePrefix.make("ISSUE"),
        confirm: true
      }).pipe(Effect.provide(testLayer({}, writes)))
      const retried = yield* createHulySequence({
        class: ModelIdentifier.make("Issue"),
        kind: "custom",
        prefix: HulySequencePrefix.make("ISSUE"),
        confirm: true
      }).pipe(Effect.provide(testLayer({ customSequences: [customSequence(HulySequenceValue.make(23))] }, writes)))
      const kindConflict = yield* createHulySequence({
        class: ModelIdentifier.make("Issue"),
        kind: "custom",
        prefix: HulySequencePrefix.make("ISSUE"),
        confirm: true
      }).pipe(Effect.provide(testLayer({ sequences: [sequence(HulySequenceValue.make(3))] }, [])), Effect.exit)
      const prefixConflict = yield* createHulySequence({
        class: ModelIdentifier.make("Issue"),
        kind: "custom",
        prefix: HulySequencePrefix.make("OTHER"),
        confirm: true
      }).pipe(
        Effect.provide(testLayer({ customSequences: [customSequence(HulySequenceValue.make(3))] }, [])),
        Effect.exit
      )

      expect(created.sequence).toMatchObject({ currentValue: 0, prefix: "ISSUE" })
      expect(retried).toEqual({
        sequence: {
          sequenceId: "sequence-custom",
          attachedClass: tracker.class.Issue,
          currentValue: 23,
          prefix: "ISSUE"
        },
        created: false
      })
      expect(writes).toEqual([{ attachedTo: tracker.class.Issue, sequence: 0, prefix: "ISSUE" }])
      expect(Exit.isFailure(kindConflict)).toBe(true)
      expect(Exit.isFailure(prefixConflict)).toBe(true)
    })
  )

  it.effect("surfaces a concurrent create refusal without falling back to a non-atomic write", () =>
    Effect.gen(function* () {
      const standardWrites: Array<unknown> = []
      const standardResult = yield* createHulySequence({
        class: ModelIdentifier.make("Issue"),
        kind: "standard",
        confirm: true
      }).pipe(
        Effect.provide(testLayer({ atomic: { kind: "available", createResult: "condition-not-met" } }, standardWrites)),
        Effect.exit
      )
      const customWrites: Array<unknown> = []
      const customResult = yield* createHulySequence({
        class: ModelIdentifier.make("Issue"),
        kind: "custom",
        prefix: HulySequencePrefix.make("ISSUE"),
        confirm: true
      }).pipe(
        Effect.provide(testLayer({ atomic: { kind: "available", createResult: "condition-not-met" } }, customWrites)),
        Effect.exit
      )

      expect(Exit.isFailure(standardResult)).toBe(true)
      expect(Exit.isFailure(customResult)).toBe(true)
      expect(standardWrites).toEqual([{ attachedTo: tracker.class.Issue, sequence: 0 }])
      expect(customWrites).toEqual([{ attachedTo: tracker.class.Issue, sequence: 0, prefix: "ISSUE" }])
    })
  )

  it.effect("fails closed when the client does not provide an atomic write primitive", () =>
    Effect.gen(function* () {
      const standardCreate = yield* createHulySequence({
        class: ModelIdentifier.make("Issue"),
        kind: "standard",
        confirm: true
      }).pipe(Effect.provide(testLayer({ atomic: { kind: "missing", operation: "create" } }, [])), Effect.exit)
      const customCreate = yield* createHulySequence({
        class: ModelIdentifier.make("Issue"),
        kind: "custom",
        prefix: HulySequencePrefix.make("ISSUE"),
        confirm: true
      }).pipe(Effect.provide(testLayer({ atomic: { kind: "missing", operation: "create" } }, [])), Effect.exit)
      const update = yield* updateHulyCustomSequence({
        sequence: SequenceIdentifier.make("sequence-custom"),
        prefix: HulySequencePrefix.make("TASK"),
        confirm: true
      }).pipe(
        Effect.provide(
          testLayer(
            {
              customSequences: [customSequence(HulySequenceValue.make(3))],
              atomic: { kind: "missing", operation: "update" }
            },
            []
          )
        ),
        Effect.exit
      )
      const remove = yield* deleteHulySequence({
        sequence: SequenceIdentifier.make("sequence-issue"),
        expectedCurrentValue: 0,
        confirm: true
      }).pipe(
        Effect.provide(
          testLayer(
            { sequences: [sequence(HulySequenceValue.make(0))], atomic: { kind: "missing", operation: "remove" } },
            []
          )
        ),
        Effect.exit
      )

      expect(Exit.isFailure(standardCreate)).toBe(true)
      expect(Exit.isFailure(customCreate)).toBe(true)
      expect(Exit.isFailure(update)).toBe(true)
      expect(Exit.isFailure(remove)).toBe(true)
    })
  )

  it.effect("updates only a custom prefix with the observed counter as an atomic guard", () =>
    Effect.gen(function* () {
      const writes: Array<unknown> = []
      const updated = yield* updateHulyCustomSequence({
        sequence: SequenceIdentifier.make("sequence-custom"),
        prefix: HulySequencePrefix.make("TASK"),
        confirm: true
      }).pipe(Effect.provide(testLayer({ customSequences: [customSequence(HulySequenceValue.make(17))] }, writes)))
      const unchanged = yield* updateHulyCustomSequence({
        sequence: SequenceIdentifier.make("sequence-custom"),
        prefix: HulySequencePrefix.make("ISSUE"),
        confirm: true
      }).pipe(Effect.provide(testLayer({ customSequences: [customSequence(HulySequenceValue.make(18))] }, writes)))

      expect(updated).toEqual({
        sequence: {
          sequenceId: "sequence-custom",
          attachedClass: tracker.class.Issue,
          currentValue: 17,
          prefix: "TASK"
        },
        updated: true
      })
      expect(unchanged.updated).toBe(false)
      expect(writes).toEqual([
        { matchQuery: { _id: "sequence-custom", sequence: 17, prefix: "ISSUE" }, operations: { prefix: "TASK" } }
      ])
    })
  )

  it.effect("protects standard sequences and reports a failed custom compare-and-set", () =>
    Effect.gen(function* () {
      const standard = yield* updateHulyCustomSequence({
        sequence: SequenceIdentifier.make("sequence-issue"),
        prefix: HulySequencePrefix.make("TASK"),
        confirm: true
      }).pipe(Effect.provide(testLayer({ sequences: [sequence(HulySequenceValue.make(3))] }, [])), Effect.exit)
      const concurrent = yield* updateHulyCustomSequence({
        sequence: SequenceIdentifier.make("sequence-custom"),
        prefix: HulySequencePrefix.make("TASK"),
        confirm: true
      }).pipe(
        Effect.provide(
          testLayer(
            {
              customSequences: [customSequence(HulySequenceValue.make(3))],
              atomic: { kind: "available", updateResult: "condition-not-met" }
            },
            []
          )
        ),
        Effect.exit
      )

      expect(Exit.isFailure(standard)).toBe(true)
      expect(Exit.isFailure(concurrent)).toBe(true)
    })
  )

  it.effect("resolves by attached class and rejects missing or ambiguous sequence matches", () =>
    Effect.gen(function* () {
      const resolved = yield* updateHulyCustomSequence({
        sequence: SequenceIdentifier.make("Issue"),
        prefix: HulySequencePrefix.make("TASK"),
        confirm: true
      }).pipe(Effect.provide(testLayer({ customSequences: [customSequence(HulySequenceValue.make(4))] }, [])))
      const missing = yield* updateHulyCustomSequence({
        sequence: SequenceIdentifier.make("Issue"),
        prefix: HulySequencePrefix.make("TASK"),
        confirm: true
      }).pipe(Effect.provide(testLayer({}, [])), Effect.exit)
      const ambiguous = yield* updateHulyCustomSequence({
        sequence: SequenceIdentifier.make("Issue"),
        prefix: HulySequencePrefix.make("TASK"),
        confirm: true
      }).pipe(
        Effect.provide(
          testLayer(
            {
              sequences: [sequence(HulySequenceValue.make(4))],
              customSequences: [customSequence(HulySequenceValue.make(4))]
            },
            []
          )
        ),
        Effect.exit
      )

      expect(resolved.sequence.prefix).toBe("TASK")
      expect(Exit.isFailure(missing)).toBe(true)
      expect(Exit.isFailure(ambiguous)).toBe(true)
    })
  )

  it.effect("deletes only a never-used sequence whose counter still matches zero", () =>
    Effect.gen(function* () {
      const mismatchWrites: Array<unknown> = []
      const mismatch = yield* deleteHulySequence({
        sequence: SequenceIdentifier.make("sequence-custom"),
        expectedCurrentValue: 0,
        confirm: true
      }).pipe(
        Effect.provide(testLayer({ customSequences: [customSequence(HulySequenceValue.make(17))] }, mismatchWrites)),
        Effect.exit
      )
      const deleteWrites: Array<unknown> = []
      const deleted = yield* deleteHulySequence({
        sequence: SequenceIdentifier.make("sequence-custom"),
        expectedCurrentValue: 0,
        confirm: true
      }).pipe(Effect.provide(testLayer({ customSequences: [customSequence(HulySequenceValue.make(0))] }, deleteWrites)))

      expect(Exit.isFailure(mismatch)).toBe(true)
      expect(mismatchWrites).toEqual([])
      expect(deleted).toEqual({ sequenceId: "sequence-custom", deleted: true })
      expect(deleteWrites).toEqual([{ matchQuery: { _id: "sequence-custom", sequence: 0, prefix: "ISSUE" } }])
    })
  )

  it.effect("atomically deletes a standard sequence and reports a concurrent delete refusal", () =>
    Effect.gen(function* () {
      const standardWrites: Array<unknown> = []
      const standard = yield* deleteHulySequence({
        sequence: SequenceIdentifier.make("sequence-issue"),
        expectedCurrentValue: 0,
        confirm: true
      }).pipe(Effect.provide(testLayer({ sequences: [sequence(HulySequenceValue.make(0))] }, standardWrites)))
      const concurrent = yield* deleteHulySequence({
        sequence: SequenceIdentifier.make("sequence-custom"),
        expectedCurrentValue: 0,
        confirm: true
      }).pipe(
        Effect.provide(
          testLayer(
            {
              customSequences: [customSequence(HulySequenceValue.make(0))],
              atomic: { kind: "available", removeResult: "condition-not-met" }
            },
            []
          )
        ),
        Effect.exit
      )

      expect(standard.deleted).toBe(true)
      expect(standardWrites).toEqual([{ matchQuery: { _id: "sequence-issue", sequence: 0 } }])
      expect(Exit.isFailure(concurrent)).toBe(true)
    })
  )

  it.effect("refuses to delete a custom sequence referenced by an identifier attribute", () =>
    Effect.gen(function* () {
      const writes: Array<unknown> = []
      const result = yield* deleteHulySequence({
        sequence: SequenceIdentifier.make("sequence-custom"),
        expectedCurrentValue: 0,
        confirm: true
      }).pipe(
        Effect.provide(
          testLayer(
            {
              customSequences: [customSequence(HulySequenceValue.make(0))],
              attributes: [unrelatedAttribute(), identifierAttribute()]
            },
            writes
          )
        ),
        Effect.exit
      )

      expect(Exit.isFailure(result)).toBe(true)
      expect(writes).toEqual([])
    })
  )
})
