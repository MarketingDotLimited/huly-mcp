import { describe, it } from "@effect/vitest"
import type { AnyAttribute, Doc, Enum as HulyEnum, PersonId, Ref, Space } from "@hcengineering/core"
import { ClassifierKind, IndexKind, toFindResult } from "@hcengineering/core"
import { Effect, Exit } from "effect"
import { expect } from "vitest"

import { ModelIdentifier } from "../../../src/domain/schemas/model-administration.js"
import { HulyAttributeIdentifier, NonEmptyString } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { core, tracker } from "../../../src/huly/huly-plugins.js"
import {
  createHulyAttribute,
  deleteHulyAttribute,
  updateHulyAttribute
} from "../../../src/huly/operations/model-attribute-writes.js"
import { createHulyEnum, deleteHulyEnum, updateHulyEnum } from "../../../src/huly/operations/model-enum-writes.js"

// SDK brands are erased at runtime; fixture strings need SDK identities, and the SDK exposes no fixture constructors.
const person = "person-1" as PersonId
const space = core.space.Model as Ref<Space>

const makeEnum = (overrides: Record<string, unknown> = {}): HulyEnum =>
  // eslint-disable-next-line no-restricted-syntax -- SDK brands are erased; this complete SDK fixture has no constructor
  ({
    _id: "enum:priority",
    _class: core.class.Enum,
    space,
    modifiedBy: person,
    modifiedOn: 0,
    name: "Priority",
    enumValues: ["Low", "High"],
    ...overrides
  }) as HulyEnum

const makeClass = (overrides: Record<string, unknown> = {}): Doc =>
  // eslint-disable-next-line no-restricted-syntax -- SDK brands are erased; this complete SDK fixture has no constructor
  ({
    _id: tracker.class.Issue,
    _class: core.class.Class,
    space,
    modifiedBy: person,
    modifiedOn: 0,
    label: "tracker:class:Issue",
    kind: ClassifierKind.CLASS,
    domain: "tracker",
    ...overrides
  }) as Doc

const makeAttribute = (overrides: Record<string, unknown> = {}): AnyAttribute =>
  // eslint-disable-next-line no-restricted-syntax -- SDK brands are erased; this complete SDK fixture has no constructor
  ({
    _id: "attribute:priority",
    _class: core.class.Attribute,
    space,
    modifiedBy: person,
    modifiedOn: 0,
    name: "priority",
    label: "Priority",
    attributeOf: tracker.class.Issue,
    type: { _class: core.class.EnumOf, of: "enum:priority" },
    isCustom: true,
    ...overrides
  }) as unknown as AnyAttribute

interface CapturedWrite {
  readonly attributes?: unknown
  readonly id?: unknown
  readonly operations?: unknown
}

interface HarnessConfig {
  readonly classes?: ReadonlyArray<Doc>
  readonly enums?: ReadonlyArray<HulyEnum>
  readonly attributes?: ReadonlyArray<AnyAttribute>
  readonly usage?: Doc
}

const testLayer = (config: HarnessConfig, writes: Array<CapturedWrite>) => {
  const classes = [...(config.classes ?? [makeClass()])]
  const enums = [...(config.enums ?? [])]
  const attributes = [...(config.attributes ?? [])]
  // The test port is generic over SDK documents; branching on its runtime class ref cannot preserve that generic relation.
  const findAll: HulyClientOperations["findAll"] = ((_class: unknown) => {
    if (_class === core.class.Enum) return Effect.succeed(toFindResult(enums))
    if (_class === core.class.Attribute) return Effect.succeed(toFindResult(attributes))
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]
  // The fixture contains classifier docs, while the generic port permits every SDK model query.
  const findAllInModel: HulyClientOperations["findAllInModel"] = (() =>
    Effect.succeed(toFindResult(classes))) as HulyClientOperations["findAllInModel"]
  // The configured fixture is selected by the test and cannot retain the caller's generic document parameter.
  const findOne: HulyClientOperations["findOne"] = (() =>
    Effect.succeed(config.usage)) as HulyClientOperations["findOne"]
  // This capture stub intentionally erases the generic SDK payload after recording it as unknown.
  const createDoc: HulyClientOperations["createDoc"] = ((
    _class: unknown,
    _space: unknown,
    data: unknown,
    id: unknown
  ) => {
    writes.push({ attributes: data, id })
    return Effect.succeed(id)
  }) as HulyClientOperations["createDoc"]
  // This capture stub intentionally erases the generic SDK update after recording it as unknown.
  const updateDoc: HulyClientOperations["updateDoc"] = ((
    _class: unknown,
    _space: unknown,
    _id: unknown,
    operations: unknown
  ) => {
    writes.push({ operations })
    return Effect.succeed({})
  }) as HulyClientOperations["updateDoc"]
  // This capture stub accepts every generic SDK document class and records only its ID.
  const removeDoc: HulyClientOperations["removeDoc"] = ((_class: unknown, _space: unknown, id: unknown) => {
    writes.push({ id })
    return Effect.succeed({})
  }) as HulyClientOperations["removeDoc"]
  return HulyClient.testLayer({ findAll, findAllInModel, findOne, createDoc, updateDoc, removeDoc })
}

describe("model enum administration", () => {
  it.effect("creates idempotently by exact enum name", () =>
    Effect.gen(function* () {
      const writes: Array<CapturedWrite> = []
      const created = yield* createHulyEnum({
        name: NonEmptyString.make("Severity"),
        values: [NonEmptyString.make("Minor"), NonEmptyString.make("Major")],
        confirm: true
      }).pipe(Effect.provide(testLayer({}, writes)))
      const existing = yield* createHulyEnum({
        name: NonEmptyString.make("Priority"),
        values: [NonEmptyString.make("Low"), NonEmptyString.make("High")],
        confirm: true
      }).pipe(
        Effect.provide(
          testLayer(
            {
              enums: [makeEnum()],
              classes: [makeClass(), makeClass({ _id: "tracker:mixin:IssueTypeData", label: "Issue" })]
            },
            writes
          )
        )
      )

      expect(created.enum.name).toBe("Severity")
      expect(created.created).toBe(true)
      expect(existing).toEqual({
        enum: { enumId: "enum:priority", name: "Priority", values: ["Low", "High"] },
        created: false
      })
      expect(writes[0]?.attributes).toEqual({ name: "Severity", enumValues: ["Minor", "Major"] })
    })
  )

  it.effect("updates names and adds options by enum name", () =>
    Effect.gen(function* () {
      const writes: Array<CapturedWrite> = []
      const result = yield* updateHulyEnum({
        enum: ModelIdentifier.make("Priority"),
        name: NonEmptyString.make("Importance"),
        values: [NonEmptyString.make("Low"), NonEmptyString.make("High"), NonEmptyString.make("Critical")],
        confirm: true
      }).pipe(Effect.provide(testLayer({ enums: [makeEnum()] }, writes)))
      expect(result.enum).toEqual({ enumId: "enum:priority", name: "Importance", values: ["Low", "High", "Critical"] })
      expect(writes[0]?.operations).toEqual({ name: "Importance", enumValues: ["Low", "High", "Critical"] })
    })
  )

  it.effect("supports independent name-only and values-only enum updates", () =>
    Effect.gen(function* () {
      const nameWrites: Array<CapturedWrite> = []
      const nameOnly = yield* updateHulyEnum({
        enum: ModelIdentifier.make("Priority"),
        name: NonEmptyString.make("Importance"),
        confirm: true
      }).pipe(Effect.provide(testLayer({ enums: [makeEnum()] }, nameWrites)))

      const valueWrites: Array<CapturedWrite> = []
      const valuesOnly = yield* updateHulyEnum({
        enum: ModelIdentifier.make("Priority"),
        values: [NonEmptyString.make("Low")],
        confirm: true
      }).pipe(
        Effect.provide(
          testLayer(
            {
              enums: [makeEnum()],
              attributes: [
                makeAttribute({ type: { _class: core.class.TypeString } }),
                makeAttribute({ _id: "attribute:other-enum", type: { _class: core.class.EnumOf, of: "enum:other" } }),
                makeAttribute({ _id: "attribute:invalid", type: null })
              ]
            },
            valueWrites
          )
        )
      )

      expect(nameOnly.enum).toMatchObject({ name: "Importance", values: ["Low", "High"] })
      expect(nameWrites[0]?.operations).toEqual({ name: "Importance" })
      expect(valuesOnly.enum).toMatchObject({ name: "Priority", values: ["Low"] })
      expect(valueWrites[0]?.operations).toEqual({ enumValues: ["Low"] })
    })
  )

  it.effect("blocks option removal and deletion while an attribute references the enum", () =>
    Effect.gen(function* () {
      const layer = testLayer({ enums: [makeEnum()], attributes: [makeAttribute()] }, [])
      const updateExit = yield* updateHulyEnum({
        enum: ModelIdentifier.make("enum:priority"),
        values: [NonEmptyString.make("Low")],
        confirm: true
      }).pipe(Effect.provide(layer), Effect.exit)
      const deleteExit = yield* deleteHulyEnum({ enum: ModelIdentifier.make("Priority"), confirm: true }).pipe(
        Effect.provide(layer),
        Effect.exit
      )
      expect(Exit.isFailure(updateExit)).toBe(true)
      expect(Exit.isFailure(deleteExit)).toBe(true)
    })
  )

  it.effect("rejects conflicting names and deletes an unreferenced enum", () =>
    Effect.gen(function* () {
      const enums = [makeEnum(), makeEnum({ _id: "enum:severity", name: "Severity" })]
      const conflict = yield* updateHulyEnum({
        enum: ModelIdentifier.make("Priority"),
        name: NonEmptyString.make("Severity"),
        confirm: true
      }).pipe(Effect.provide(testLayer({ enums }, [])), Effect.exit)
      const writes: Array<CapturedWrite> = []
      const deleted = yield* deleteHulyEnum({ enum: ModelIdentifier.make("Severity"), confirm: true }).pipe(
        Effect.provide(testLayer({ enums }, writes))
      )
      expect(Exit.isFailure(conflict)).toBe(true)
      expect(deleted).toEqual({ enumId: "enum:severity", deleted: true })
      expect(writes).toEqual([{ id: "enum:severity" }])
    })
  )

  it.effect("rejects create-by-name when existing enum values differ", () =>
    Effect.gen(function* () {
      const conflict = yield* createHulyEnum({
        name: NonEmptyString.make("Priority"),
        values: [NonEmptyString.make("Other")],
        confirm: true
      }).pipe(Effect.provide(testLayer({ enums: [makeEnum()] }, [])), Effect.exit)
      expect(Exit.isFailure(conflict)).toBe(true)
    })
  )

  it.effect("rejects missing and ambiguous enum names", () =>
    Effect.gen(function* () {
      const missing = yield* deleteHulyEnum({ enum: ModelIdentifier.make("Missing"), confirm: true }).pipe(
        Effect.provide(testLayer({}, [])),
        Effect.exit
      )
      const ambiguous = yield* deleteHulyEnum({ enum: ModelIdentifier.make("Priority"), confirm: true }).pipe(
        Effect.provide(testLayer({ enums: [makeEnum({ _id: "enum:a" }), makeEnum({ _id: "enum:b" })] }, [])),
        Effect.exit
      )
      expect(Exit.isFailure(missing)).toBe(true)
      expect(Exit.isFailure(ambiguous)).toBe(true)
    })
  )
})

describe("model attribute administration", () => {
  it.effect("creates enum and reference attributes using class and target names", () =>
    Effect.gen(function* () {
      const writes: Array<CapturedWrite> = []
      const enumResult = yield* createHulyAttribute({
        class: ModelIdentifier.make("Issue"),
        name: NonEmptyString.make("priority"),
        label: NonEmptyString.make("Priority"),
        type: { kind: "enum", enum: ModelIdentifier.make("Priority") },
        index: "indexed",
        automationOnly: true,
        hidden: false,
        confirm: true
      }).pipe(Effect.provide(testLayer({ enums: [makeEnum()] }, writes)))
      const refResult = yield* createHulyAttribute({
        class: ModelIdentifier.make("Issue"),
        name: NonEmptyString.make("related"),
        label: NonEmptyString.make("Related"),
        type: { kind: "ref", class: ModelIdentifier.make("Issue") },
        confirm: true
      }).pipe(Effect.provide(testLayer({}, writes)))
      expect(enumResult.attribute.type).toMatchObject({ kind: "enum", enumId: "enum:priority" })
      expect(enumResult.attribute).toMatchObject({ index: IndexKind.Indexed, automationOnly: true, hidden: false })
      expect(refResult.attribute.type).toMatchObject({ kind: "ref", refTo: tracker.class.Issue })
      expect(writes).toHaveLength(2)
    })
  )

  it.effect("resolves classes by exact id and label and maps every index kind", () =>
    Effect.gen(function* () {
      const writes: Array<CapturedWrite> = []
      const labeledClass = makeClass({ _id: "custom:class:WorkItem", label: "Work item" })
      const exact = yield* createHulyAttribute({
        class: ModelIdentifier.make("custom:class:WorkItem"),
        name: NonEmptyString.make("searchable"),
        label: NonEmptyString.make("Searchable"),
        type: { kind: "string" },
        index: "fulltext",
        confirm: true
      }).pipe(Effect.provide(testLayer({ classes: [labeledClass] }, writes)))
      const labeled = yield* createHulyAttribute({
        class: ModelIdentifier.make("Work item"),
        name: NonEmptyString.make("ordered"),
        label: NonEmptyString.make("Ordered"),
        type: { kind: "number" },
        index: "indexedDescending",
        confirm: true
      }).pipe(Effect.provide(testLayer({ classes: [labeledClass] }, writes)))

      expect(exact.attribute).toMatchObject({ ownerClassId: "custom:class:WorkItem", index: IndexKind.FullText })
      expect(labeled.attribute).toMatchObject({ ownerClassId: "custom:class:WorkItem", index: IndexKind.IndexedDsc })
    })
  )

  it.effect("builds every supported scalar type and returns an existing same-name attribute idempotently", () =>
    Effect.gen(function* () {
      const kinds = ["string", "number", "boolean", "date", "markup"] as const
      const writes: Array<CapturedWrite> = []
      const results = yield* Effect.forEach(kinds, (kind) =>
        createHulyAttribute({
          class: ModelIdentifier.make("Issue"),
          name: NonEmptyString.make(`field-${kind}`),
          label: NonEmptyString.make(kind),
          type: { kind },
          confirm: true
        }).pipe(Effect.provide(testLayer({}, writes)))
      )
      const existing = yield* createHulyAttribute({
        class: ModelIdentifier.make("Issue"),
        name: NonEmptyString.make("priority"),
        label: NonEmptyString.make("Priority"),
        type: { kind: "enum", enum: ModelIdentifier.make("Priority") },
        confirm: true
      }).pipe(Effect.provide(testLayer({ enums: [makeEnum()], attributes: [makeAttribute()] }, writes)))
      expect(results.map((result) => result.attribute.type.kind)).toEqual(kinds)
      expect(existing.created).toBe(false)
      expect(writes).toHaveLength(kinds.length)
    })
  )

  it.effect("rejects create-by-name when the existing attribute definition differs", () =>
    Effect.gen(function* () {
      const conflict = yield* createHulyAttribute({
        class: ModelIdentifier.make("Issue"),
        name: NonEmptyString.make("priority"),
        label: NonEmptyString.make("Different"),
        type: { kind: "string" },
        confirm: true
      }).pipe(Effect.provide(testLayer({ attributes: [makeAttribute()] }, [])), Effect.exit)
      expect(Exit.isFailure(conflict)).toBe(true)
    })
  )

  it.effect("recognizes an equivalent indexed reference attribute", () =>
    Effect.gen(function* () {
      const existing = makeAttribute({
        type: { _class: core.class.RefTo, to: tracker.class.Issue },
        index: IndexKind.Indexed
      })
      const result = yield* createHulyAttribute({
        class: ModelIdentifier.make("Issue"),
        name: NonEmptyString.make("priority"),
        label: NonEmptyString.make("Priority"),
        type: { kind: "ref", class: ModelIdentifier.make("Issue") },
        index: "indexed",
        confirm: true
      }).pipe(Effect.provide(testLayer({ attributes: [existing] }, [])))
      expect(result.created).toBe(false)
      expect(result.attribute.type).toMatchObject({ kind: "ref", refTo: tracker.class.Issue })
    })
  )

  it.effect("updates and unhides a custom attribute while allowing index removal", () =>
    Effect.gen(function* () {
      const writes: Array<CapturedWrite> = []
      const result = yield* updateHulyAttribute({
        attribute: HulyAttributeIdentifier.make("priority"),
        class: ModelIdentifier.make("Issue"),
        label: NonEmptyString.make("Importance"),
        index: null,
        automationOnly: false,
        hidden: false,
        confirm: true
      }).pipe(
        Effect.provide(testLayer({ attributes: [makeAttribute({ index: IndexKind.Indexed, hidden: true })] }, writes))
      )
      expect(result.attribute).not.toHaveProperty("index")
      expect(result.attribute).toMatchObject({ label: "Importance", automationOnly: false, hidden: false })
      expect(writes[0]?.operations).toMatchObject({ $unset: { index: "" }, hidden: false })
    })
  )

  it.effect("resolves an exact attribute id within its owner and maps update indexes", () =>
    Effect.gen(function* () {
      const attributes = [makeAttribute(), makeAttribute({ _id: "attribute:other", attributeOf: "custom:class:Other" })]
      const fulltextWrites: Array<CapturedWrite> = []
      const fulltext = yield* updateHulyAttribute({
        attribute: HulyAttributeIdentifier.make("attribute:priority"),
        class: ModelIdentifier.make("tracker:class:Issue"),
        index: "fulltext",
        hidden: true,
        confirm: true
      }).pipe(Effect.provide(testLayer({ attributes }, fulltextWrites)))
      const descendingWrites: Array<CapturedWrite> = []
      const descending = yield* updateHulyAttribute({
        attribute: HulyAttributeIdentifier.make("priority"),
        index: "indexedDescending",
        confirm: true
      }).pipe(Effect.provide(testLayer({ attributes: [makeAttribute()] }, descendingWrites)))

      expect(fulltext.attribute).toMatchObject({ index: IndexKind.FullText, hidden: true })
      expect(fulltextWrites[0]?.operations).toMatchObject({ index: IndexKind.FullText, hidden: true })
      expect(descending.attribute).toMatchObject({ index: IndexKind.IndexedDsc })
      expect(descendingWrites[0]?.operations).toMatchObject({ index: IndexKind.IndexedDsc })
    })
  )

  it.effect("protects built-in and in-use attributes from mutation or deletion", () =>
    Effect.gen(function* () {
      const builtIn = makeAttribute({ isCustom: false })
      const protectedUpdate = yield* updateHulyAttribute({
        attribute: HulyAttributeIdentifier.make("priority"),
        label: NonEmptyString.make("Changed"),
        confirm: true
      }).pipe(Effect.provide(testLayer({ attributes: [builtIn] }, [])), Effect.exit)
      const inUseDelete = yield* deleteHulyAttribute({
        attribute: HulyAttributeIdentifier.make("priority"),
        confirm: true
      }).pipe(Effect.provide(testLayer({ attributes: [makeAttribute()], usage: makeClass() }, [])), Effect.exit)
      expect(Exit.isFailure(protectedUpdate)).toBe(true)
      expect(Exit.isFailure(inUseDelete)).toBe(true)
    })
  )

  it.effect("allows hidden-only updates on built-in attributes", () =>
    Effect.gen(function* () {
      const writes: Array<CapturedWrite> = []
      const result = yield* updateHulyAttribute({
        attribute: HulyAttributeIdentifier.make("priority"),
        hidden: true,
        confirm: true
      }).pipe(Effect.provide(testLayer({ attributes: [makeAttribute({ isCustom: false })] }, writes)))
      expect(result.attribute.hidden).toBe(true)
      expect(writes[0]?.operations).toEqual({ hidden: true })
    })
  )

  it.effect("deletes an unused custom attribute", () =>
    Effect.gen(function* () {
      const writes: Array<CapturedWrite> = []
      const result = yield* deleteHulyAttribute({
        attribute: HulyAttributeIdentifier.make("priority"),
        class: ModelIdentifier.make("Issue"),
        confirm: true
      }).pipe(Effect.provide(testLayer({ attributes: [makeAttribute()] }, writes)))
      expect(result).toEqual({ attributeId: "attribute:priority", deleted: true })
      expect(writes).toEqual([{ id: "attribute:priority" }])
    })
  )

  it.effect("rejects missing or ambiguous class and attribute names", () =>
    Effect.gen(function* () {
      const missingClass = yield* createHulyAttribute({
        class: ModelIdentifier.make("Missing"),
        name: NonEmptyString.make("field"),
        label: NonEmptyString.make("Field"),
        type: { kind: "string" },
        confirm: true
      }).pipe(Effect.provide(testLayer({}, [])), Effect.exit)
      const ambiguousClass = yield* createHulyAttribute({
        class: ModelIdentifier.make("Issue"),
        name: NonEmptyString.make("field"),
        label: NonEmptyString.make("Field"),
        type: { kind: "string" },
        confirm: true
      }).pipe(
        Effect.provide(
          testLayer({ classes: [makeClass({ _id: "a:class:Issue" }), makeClass({ _id: "b:class:Issue" })] }, [])
        ),
        Effect.exit
      )
      const missingAttribute = yield* deleteHulyAttribute({
        attribute: HulyAttributeIdentifier.make("missing"),
        confirm: true
      }).pipe(Effect.provide(testLayer({}, [])), Effect.exit)
      const ambiguousAttribute = yield* deleteHulyAttribute({
        attribute: HulyAttributeIdentifier.make("priority"),
        confirm: true
      }).pipe(
        Effect.provide(
          testLayer({ attributes: [makeAttribute({ _id: "attribute:a" }), makeAttribute({ _id: "attribute:b" })] }, [])
        ),
        Effect.exit
      )
      expect(Exit.isFailure(missingClass)).toBe(true)
      expect(Exit.isFailure(ambiguousClass)).toBe(true)
      expect(Exit.isFailure(missingAttribute)).toBe(true)
      expect(Exit.isFailure(ambiguousAttribute)).toBe(true)
    })
  )
})
