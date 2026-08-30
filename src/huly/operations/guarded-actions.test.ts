import {
  type AnyAttribute,
  type Class,
  type Data,
  type Doc,
  type DocumentQuery,
  type DocumentUpdate,
  type Ref,
  type Space,
  toFindResult
} from "@hcengineering/core"
import { Effect, Schema } from "effect"
import { TestClock } from "effect/testing"
import { describe, it } from "@effect/vitest"
import { afterEach, expect, vi } from "vitest"

import { HulyClient, type HulyClientOperations } from "../client.js"
import { core } from "../huly-plugins.js"
import { executeHulyAction, findHulyDocuments, prepareHulyAction } from "./guarded-actions.js"
import type { MetadataClassDoc } from "./sdk-discovery-mappers.js"

const widgetClass = "test:class:Widget"
const detailsMixin = "test:mixin:Details"
const workspace = "test:space:Workspace"
const input = <A>(value: unknown): A => Schema.decodeUnknownSync(Schema.Unknown)(value) as A
const at = <T>(values: ReadonlyArray<T>, index: number): T => {
  const value = values[index]
  if (value === undefined) throw new Error(`Missing fixture at index ${index}`)
  return value
}
const base = <T extends Doc>(_id: string, _class: string, space: string, modifiedOn = 1) =>
  input<T>({ _id, _class, space, modifiedOn, modifiedBy: "test-social-id" })

const modelClass = (id: string): MetadataClassDoc =>
  input({
    ...base(id, String(core.class.Class), String(core.space.Model)),
    label: `test:string:${id.split(":").at(-1)}`,
    kind: 0
  })

const attribute = (owner: string, name: string): AnyAttribute =>
  input({
    ...base(`${owner}:${name}`, String(core.class.Attribute), String(core.space.Model)),
    attributeOf: owner,
    name,
    label: `test:string:${name}`,
    type: { _class: "core:class:TypeString" }
  })

interface GuardedState {
  readonly classes: Array<MetadataClassDoc>
  readonly attributes: Array<AnyAttribute>
  readonly documents: Array<Doc>
  readonly writes: Array<{ readonly kind: string; readonly id: string; readonly value?: unknown }>
}

const stateFixture = (): GuardedState => ({
  classes: [modelClass(widgetClass), modelClass(detailsMixin)],
  attributes: [attribute(widgetClass, "title"), attribute(widgetClass, "count"), attribute(detailsMixin, "notes")],
  documents: [input({ ...base("widget-1", widgetClass, workspace, 10), title: "First", count: 1 })],
  writes: []
})

const queryIds = (query: unknown): ReadonlyArray<string> | undefined => {
  if (typeof query !== "object" || query === null) return undefined
  const id = Reflect.get(query, "_id")
  if (typeof id !== "object" || id === null) return undefined
  const values = Reflect.get(id, "$in")
  return Array.isArray(values) ? values.map(String) : undefined
}

const layerFor = (state: GuardedState, accountUuid = "00000000-0000-4000-8000-000000000000") => {
  const findAll: HulyClientOperations["findAll"] = (<T extends Doc>(
    classId: Ref<Class<T>>,
    query: DocumentQuery<T>
  ) => {
    let docs: ReadonlyArray<Doc>
    if (classId === core.class.Class) docs = state.classes
    else if (classId === core.class.Attribute) docs = state.attributes
    else docs = state.documents.filter((item) => typeof item !== "object" || item._class === classId)
    const exactId = typeof Reflect.get(query, "_id") === "string" ? String(Reflect.get(query, "_id")) : undefined
    const ids = queryIds(query)
    const owners =
      typeof Reflect.get(query, "attributeOf") === "object"
        ? queryIds({ _id: Reflect.get(query, "attributeOf") })
        : undefined
    if (exactId !== undefined) docs = docs.filter((item) => String(item._id) === exactId)
    if (ids !== undefined) docs = docs.filter((item) => ids.includes(String(item._id)))
    if (owners !== undefined) docs = docs.filter((item) => owners.includes(String(Reflect.get(item, "attributeOf"))))
    return Effect.succeed(toFindResult(input<Array<T>>(Array.from(docs))))
  }) as HulyClientOperations["findAll"]
  const findOne: HulyClientOperations["findOne"] = (<T extends Doc>(classId: Ref<Class<T>>, query: DocumentQuery<T>) =>
    Effect.map(findAll(classId, query), (items) => items[0])) as HulyClientOperations["findOne"]
  const createDoc: HulyClientOperations["createDoc"] = (<T extends Doc>(
    classId: Ref<Class<T>>,
    space: Ref<Space>,
    attributes: Data<T>
  ) => {
    const id = `created-${state.writes.length + 1}` as Ref<T>
    state.documents.push(input({ ...base(String(id), String(classId), String(space), 20), ...attributes }))
    state.writes.push({ kind: "create", id: String(id), value: attributes })
    return Effect.succeed(id)
  }) as HulyClientOperations["createDoc"]
  const updateDoc: HulyClientOperations["updateDoc"] = (<T extends Doc>(
    _class: Ref<Class<T>>,
    _space: Ref<Space>,
    objectId: Ref<T>,
    operations: DocumentUpdate<T>
  ) => {
    const target = state.documents.find((item) => item._id === objectId)
    if (target !== undefined) Object.assign(target, operations)
    state.writes.push({ kind: "update", id: String(objectId), value: operations })
    return Effect.succeed({})
  }) as HulyClientOperations["updateDoc"]
  const removeDoc = input<HulyClientOperations["removeDoc"]>((_class: unknown, _space: unknown, objectId: string) => {
    const index = state.documents.findIndex((item) => item._id === objectId)
    if (index >= 0) state.documents.splice(index, 1)
    state.writes.push({ kind: "remove", id: objectId })
    return Effect.succeed({})
  })
  const createMixin = input<HulyClientOperations["createMixin"]>(
    (objectId: string, ...args: ReadonlyArray<unknown>) => {
      state.writes.push({ kind: "createMixin", id: objectId, value: args.at(-1) })
      return Effect.succeed(undefined)
    }
  )
  const updateMixin = input<HulyClientOperations["updateMixin"]>(
    (objectId: string, ...args: ReadonlyArray<unknown>) => {
      state.writes.push({ kind: "updateMixin", id: objectId, value: args.at(-1) })
      return Effect.succeed(undefined)
    }
  )
  return HulyClient.testLayer({
    getAccountUuid: () => input(accountUuid),
    findAll,
    findOne,
    createDoc,
    updateDoc,
    removeDoc,
    createMixin,
    updateMixin
  })
}

const run = <A, E>(effect: Effect.Effect<A, E, HulyClient>, state: GuardedState, account?: string) =>
  Effect.runPromise(effect.pipe(Effect.provide(layerFor(state, account))))

const prepare = (action: unknown, state: GuardedState, account?: string) =>
  run(prepareHulyAction(input({ action })), state, account)

afterEach(() => vi.unstubAllEnvs())

describe("guarded Huly actions", () => {
  it("finds bounded documents and applies projections", async () => {
    const state = stateFixture()
    state.documents.push(input({ ...base("widget-undefined", widgetClass, workspace), title: undefined }))
    const all = await run(findHulyDocuments(input({ class: widgetClass, query: {}, limit: 5 })), state)
    expect(all.returned).toBe(2)
    expect(all.documents[0]).toMatchObject({ _id: "widget-1", title: "First" })
    expect((await run(findHulyDocuments(input({ class: widgetClass })), state)).returned).toBe(2)
    const projected = await run(
      findHulyDocuments(input({ class: widgetClass, projection: ["title"], limit: 5 })),
      state
    )
    expect(projected.documents[0]).toEqual({
      _id: "widget-1",
      _class: widgetClass,
      space: workspace,
      modifiedOn: 10,
      title: "First"
    })
    state.documents.push(input("primitive-document"))
    expect((await run(findHulyDocuments(input({ class: widgetClass })), state)).documents).toContainEqual({})
  })

  it("previews and executes create, update, and remove exactly once", async () => {
    const state = stateFixture()
    const created = await prepare(
      { kind: "create", class: widgetClass, space: workspace, data: { title: ["New"], count: 2 } },
      state
    )
    expect(created.payloadHash).toMatch(/^[0-9a-f]{64}$/)
    expect(await run(executeHulyAction(input({ approvalToken: created.approvalToken })), state)).toMatchObject({
      kind: "create",
      executed: true
    })
    await expect(run(executeHulyAction(input({ approvalToken: created.approvalToken })), state)).rejects.toThrow(
      "already been used"
    )

    const updated = await prepare(
      {
        kind: "update",
        class: widgetClass,
        objectId: "widget-1",
        operations: { title: "Changed", $inc: { count: 1 } },
        expectedModifiedOn: 10
      },
      state
    )
    expect((await run(executeHulyAction(input({ approvalToken: updated.approvalToken })), state)).objectId).toBe(
      "widget-1"
    )
    const operator = await prepare(
      { kind: "update", class: widgetClass, objectId: "widget-1", operations: { $unset: "title" } },
      state
    )
    await run(executeHulyAction(input({ approvalToken: operator.approvalToken })), state)

    const removed = await prepare(
      { kind: "remove", class: widgetClass, objectId: "widget-1", expectedModifiedOn: 10 },
      state
    )
    expect((await run(executeHulyAction(input({ approvalToken: removed.approvalToken })), state)).kind).toBe("remove")
    expect(state.documents.some((item) => item._id === "widget-1")).toBe(false)
  })

  it("creates and updates mixins through the guarded path", async () => {
    const state = stateFixture()
    const first = await prepare(
      {
        kind: "apply_mixin",
        objectClass: widgetClass,
        objectId: "widget-1",
        mixin: detailsMixin,
        data: { notes: "One" }
      },
      state
    )
    await run(executeHulyAction(input({ approvalToken: first.approvalToken })), state)
    expect(state.writes.at(-1)?.kind).toBe("createMixin")
    state.documents.push(input({ ...base("widget-1", detailsMixin, workspace, 10), notes: "Existing" }))
    const second = await prepare(
      {
        kind: "apply_mixin",
        objectClass: widgetClass,
        objectId: "widget-1",
        mixin: detailsMixin,
        data: { notes: "Two" }
      },
      state
    )
    await run(executeHulyAction(input({ approvalToken: second.approvalToken })), state)
    expect(state.writes.at(-1)?.kind).toBe("updateMixin")
  })

  it("binds approvals to an account and detects target drift", async () => {
    const state = stateFixture()
    const accountBound = await prepare({ kind: "remove", class: widgetClass, objectId: "widget-1" }, state, "account-a")
    await expect(
      run(executeHulyAction(input({ approvalToken: accountBound.approvalToken })), state, "account-b")
    ).rejects.toThrow("different Huly account")
    const drift = await prepare(
      { kind: "update", class: widgetClass, objectId: "widget-1", operations: { title: "Changed" } },
      state
    )
    at(state.documents, 0).modifiedOn = 11
    await expect(run(executeHulyAction(input({ approvalToken: drift.approvalToken })), state)).rejects.toThrow(
      "changed after preview"
    )
    at(state.documents, 0).modifiedOn = 10
    const mixinDrift = await prepare(
      {
        kind: "apply_mixin",
        objectClass: widgetClass,
        objectId: "widget-1",
        mixin: detailsMixin,
        data: { notes: "No" }
      },
      state
    )
    at(state.documents, 0).modifiedOn = 12
    await expect(run(executeHulyAction(input({ approvalToken: mixinDrift.approvalToken })), state)).rejects.toThrow(
      "changed after preview"
    )
    at(state.documents, 0).modifiedOn = 10
    const removeDrift = await prepare({ kind: "remove", class: widgetClass, objectId: "widget-1" }, state)
    at(state.documents, 0).modifiedOn = 13
    await expect(run(executeHulyAction(input({ approvalToken: removeDrift.approvalToken })), state)).rejects.toThrow(
      "changed after preview"
    )
  })

  it("rejects protected targets, unknown fields, system fields, and missing documents", async () => {
    const state = stateFixture()
    await expect(run(findHulyDocuments(input({ class: "core:class:Class" })), state)).rejects.toThrow("protected")
    await expect(
      prepare({ kind: "create", class: widgetClass, space: "core:space:Model", data: { title: "No" } }, state)
    ).rejects.toThrow("protected Huly space")
    await expect(
      prepare({ kind: "create", class: widgetClass, space: workspace, data: { missing: true } }, state)
    ).rejects.toThrow("Unknown fields")
    await expect(
      prepare({ kind: "update", class: widgetClass, objectId: "widget-1", operations: { _id: "other" } }, state)
    ).rejects.toThrow("System-managed")
    await expect(prepare({ kind: "remove", class: widgetClass, objectId: "missing" }, state)).rejects.toThrow(
      "not found"
    )
    await expect(prepare({ kind: "remove", class: "tx:class:Tx", objectId: "x" }, state)).rejects.toThrow("protected")
  })

  it("checks explicit modifiedOn preconditions and fails closed when audit storage is unavailable", async () => {
    const state = stateFixture()
    await expect(
      prepare(
        {
          kind: "update",
          class: widgetClass,
          objectId: "widget-1",
          operations: { title: "No" },
          expectedModifiedOn: 9
        },
        state
      )
    ).rejects.toThrow("precondition")
    vi.stubEnv("HULY_AUDIT_LOG_PATH", "/proc")
    await expect(prepare({ kind: "remove", class: widgetClass, objectId: "widget-1" }, state)).rejects.toThrow(
      "audit log is unavailable"
    )
    expect(state.writes).toEqual([])
  })

  it.effect("retains optional preview fields and expires approval tokens", () =>
    Effect.gen(function* () {
      const state = stateFixture()
      Reflect.deleteProperty(at(state.documents, 0), "space")
      const prepared = yield* prepareHulyAction(
        input({ action: { kind: "update", class: widgetClass, objectId: "widget-1", operations: { title: "Late" } } })
      ).pipe(Effect.provide(layerFor(state)))
      yield* TestClock.adjust("6 minutes")
      const exit = yield* Effect.exit(
        executeHulyAction(input({ approvalToken: prepared.approvalToken })).pipe(Effect.provide(layerFor(state)))
      )
      expect(exit._tag).toBe("Failure")
    })
  )
})
