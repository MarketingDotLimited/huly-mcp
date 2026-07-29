import { describe, it } from "@effect/vitest"
import type { AccountUuid, Class, Doc, DocumentQuery, PersonId, Ref, Space } from "@hcengineering/core"
import { SortingOrder, toFindResult } from "@hcengineering/core"
import type { IntlString } from "@hcengineering/platform"
import type { AnyComponent } from "@hcengineering/ui"
import type { FilteredView, Viewlet, ViewletDescriptor, ViewletPreference } from "@hcengineering/view"
import { Effect } from "effect"
import { expect } from "vitest"

import {
  FilteredViewIdentifier,
  NonEmptyString,
  ObjectClassName,
  ViewletIdentifier
} from "../../../src/domain/schemas.js"
import type { ToolWarning } from "../../../src/domain/schemas/tool-warnings.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { Diagnostics, makeDiagnosticsScope } from "../../../src/huly/diagnostics.js"
import {
  FilteredViewIdentifierAmbiguousError,
  FilteredViewNotFoundError,
  ViewletIdentifierAmbiguousError,
  ViewletNotFoundError
} from "../../../src/huly/errors.js"
import { board, core, view } from "../../../src/huly/huly-plugins.js"
import { toRef } from "../../../src/huly/operations/sdk-boundary.js"
import { getFilteredView, listFilteredViews, listViewlets } from "../../../src/huly/operations/views.js"

// Huly SDK brands, intl ids, and component handles are erased at runtime; these fixture casts restore
// compile-time brands for stable literals that match the SDK shapes used by the fake client.
const accountUuid = (value: string): AccountUuid => value as AccountUuid
const personId = (value: string): PersonId => value as PersonId
const intl = (value: string): IntlString => value as IntlString
const component = (value: string): AnyComponent => value as AnyComponent

const account = accountUuid("00000000-0000-4000-8000-000000000000")
const person = personId("person-1")
const boardCardClass = toRef<Class<Doc>>(String(board.class.Card))
const fv = FilteredViewIdentifier.make
const v = ViewletIdentifier.make
const attachedTo = NonEmptyString.make
const attachTo = ObjectClassName.make

const docBase = <T extends Doc>(_id: Ref<T>, _class: Ref<Class<T>>, space: Ref<Space>) => ({
  _id,
  _class,
  space,
  modifiedOn: 1,
  modifiedBy: core.account.System
})

const makeFilteredView = (overrides: Partial<FilteredView> = {}): FilteredView => ({
  ...docBase(toRef<FilteredView>("filtered-view-1"), view.class.FilteredView, core.space.Workspace),
  name: "Mine",
  location: { path: ["board"] },
  filters: '[{"key":"status"}]',
  viewOptions: { groupBy: ["status"], orderBy: ["modifiedOn", SortingOrder.Descending] },
  filterClass: boardCardClass,
  viewletId: toRef<Viewlet>("viewlet-kanban"),
  sharable: false,
  users: [account],
  createdBy: person,
  attachedTo: String(board.app.Board),
  ...overrides
})

const makeViewlet = (overrides: Partial<Viewlet> = {}): Viewlet => ({
  ...docBase(toRef<Viewlet>("viewlet-kanban"), view.class.Viewlet, core.space.Model),
  attachTo: boardCardClass,
  descriptor: toRef<ViewletDescriptor>("descriptor-kanban"),
  config: ["title", { key: "status", props: { compact: true } }],
  title: "Kanban",
  variant: "kanban",
  props: { board: true },
  ...overrides
})

const makeDescriptor = (overrides: Partial<ViewletDescriptor> = {}): ViewletDescriptor => ({
  ...docBase(toRef<ViewletDescriptor>("descriptor-kanban"), view.class.ViewletDescriptor, core.space.Model),
  label: intl("view:string:Kanban"),
  component: component("view:component:Kanban"),
  color: 3,
  ...overrides
})

const makeViewletPreference = (overrides: Partial<ViewletPreference> = {}): ViewletPreference => ({
  ...docBase(toRef<ViewletPreference>("viewlet-pref-1"), view.class.ViewletPreference, core.space.Workspace),
  attachedTo: toRef<Viewlet>("viewlet-kanban"),
  config: ["title"],
  ...overrides
})

interface Fixture {
  readonly filteredViews?: ReadonlyArray<FilteredView>
  readonly viewlets?: ReadonlyArray<Viewlet>
  readonly descriptors?: ReadonlyArray<ViewletDescriptor>
  readonly preferences?: ReadonlyArray<ViewletPreference>
}

const fieldMatches = (actual: unknown, expected: unknown): boolean => {
  if (expected !== null && typeof expected === "object") {
    // Safe because this fake matcher only reads the DocumentQuery operator subset emitted here.
    const op = expected as { readonly $in?: ReadonlyArray<unknown>; readonly $like?: string }
    if (op.$in !== undefined) return op.$in.includes(actual)
    if (op.$like !== undefined && typeof actual === "string") {
      return actual.includes(op.$like.replaceAll("%", "").replaceAll("\\", ""))
    }
  }
  return actual === expected
}

const matchesQuery = <T extends Doc>(doc: T, query: DocumentQuery<T>): boolean => {
  // Safe for this fake client: SDK queries/docs are open objects indexed by Huly field names.
  return Object.entries(query as Record<string, unknown>).every(([key, expected]) =>
    fieldMatches((doc as Record<string, unknown>)[key], expected)
  )
}

const createLayer = (fixture: Fixture = {}) => {
  const filteredViews = [...(fixture.filteredViews ?? [makeFilteredView()])]
  const viewlets = [
    ...(fixture.viewlets ?? [
      makeViewlet(),
      makeViewlet({
        _id: toRef<Viewlet>("viewlet-table"),
        descriptor: view.viewlet.Table,
        title: "Table",
        variant: "table"
      })
    ])
  ]
  const descriptors = [
    ...(fixture.descriptors ?? [
      makeDescriptor(),
      makeDescriptor({
        _id: view.viewlet.Table,
        label: intl("view:string:Table"),
        component: component("view:component:Table")
      })
    ])
  ]
  const preferences = [...(fixture.preferences ?? [makeViewletPreference()])]

  const selectSource = (classId: string): Array<Doc> => {
    if (classId === String(view.class.FilteredView)) return filteredViews
    if (classId === String(view.class.ViewletPreference)) return preferences
    return []
  }
  const selectModelSource = (classId: string): Array<Doc> => {
    if (classId === String(view.class.Viewlet)) return viewlets
    if (classId === String(view.class.ViewletDescriptor)) return descriptors
    return []
  }
  const makeFindAll =
    (select: (classId: string) => Array<Doc>): HulyClientOperations["findAll"] =>
    (_class, query, options) => {
      // Safe because the fake SDK stores heterogeneous docs but narrows by class before query matching.
      const matched = select(String(_class)).filter((doc) => matchesQuery(doc, query as DocumentQuery<Doc>))
      const limited = options?.limit === undefined ? matched : matched.slice(0, options.limit)
      // Safe because class narrowing already selected docs compatible with the SDK-generic result.
      return Effect.succeed(toFindResult(limited as Array<never>, matched.length))
    }
  const findAll = makeFindAll(selectSource)
  const findAllInModel = makeFindAll(selectModelSource)

  return HulyClient.testLayer({
    getAccountUuid: () => account,
    findAll,
    findAllInModel,
    findOne: (_class, query, options) => Effect.map(findAll(_class, query, options), (result) => result[0])
  })
}

const runWithDiagnostics = <A, E>(
  effect: Effect.Effect<A, E, HulyClient | Diagnostics>,
  layer: ReturnType<typeof createLayer>
): Effect.Effect<A, E> =>
  Effect.gen(function* () {
    const diagnostics = yield* makeDiagnosticsScope
    return yield* effect.pipe(Effect.provide(layer), Effect.provideService(Diagnostics, diagnostics.service))
  })

const runWithWarnings = <A, E>(
  effect: Effect.Effect<A, E, HulyClient | Diagnostics>,
  layer: ReturnType<typeof createLayer>
): Effect.Effect<{ readonly result: A; readonly warnings: ReadonlyArray<ToolWarning> }, E> =>
  Effect.gen(function* () {
    const diagnostics = yield* makeDiagnosticsScope
    const result = yield* effect.pipe(Effect.provide(layer), Effect.provideService(Diagnostics, diagnostics.service))
    const warnings = yield* diagnostics.drainWarnings

    return { result, warnings }
  })

describe("generic view discovery operations", () => {
  it.effect("lists filtered views by attachedTo, search, visibility, and limit", () =>
    Effect.gen(function* () {
      const shared = makeFilteredView({
        _id: toRef<FilteredView>("filtered-view-shared"),
        name: "Shared",
        users: [],
        sharable: true
      })
      const otherModule = makeFilteredView({
        _id: toRef<FilteredView>("filtered-view-other"),
        name: "Other Module",
        attachedTo: "contact:app:Contacts"
      })
      const fixture = createLayer({ filteredViews: [makeFilteredView(), shared, otherModule] })

      const listed = yield* listFilteredViews({
        attachedTo: attachedTo(String(board.app.Board)),
        visibility: "shared",
        nameSearch: "Shared",
        limit: 1
      }).pipe(Effect.provide(fixture))

      expect(listed).toEqual({
        filteredViews: [
          {
            id: "filtered-view-shared",
            name: "Shared",
            attachedTo: String(board.app.Board),
            visibility: "shared",
            sharable: true,
            users: 0,
            viewletId: "viewlet-kanban"
          }
        ],
        total: 1
      })

      const unscoped = yield* listFilteredViews({}).pipe(Effect.provide(fixture))
      expect(unscoped.total).toBe(3)
    })
  )

  it.effect("gets filtered views by id or exact name and scopes by attachedTo", () =>
    Effect.gen(function* () {
      const shared = makeFilteredView({
        _id: toRef<FilteredView>("filtered-view-shared"),
        name: "Shared",
        users: [],
        viewletId: null
      })
      const minimal = makeFilteredView({
        _id: toRef<FilteredView>("filtered-view-minimal"),
        name: "Minimal",
        attachedTo: "contact:app:Contacts"
      })
      const fixture = createLayer({ filteredViews: [makeFilteredView(), shared, minimal] })

      const byId = yield* getFilteredView({ filteredView: fv("filtered-view-shared") }).pipe(Effect.provide(fixture))
      expect(byId).not.toHaveProperty("viewletId")
      expect(byId.visibility).toBe("shared")

      const scoped = yield* getFilteredView({
        filteredView: fv("Minimal"),
        attachedTo: attachedTo("contact:app:Contacts")
      }).pipe(Effect.provide(fixture))
      expect(scoped.attachedTo).toBe("contact:app:Contacts")
      expect(scoped.filters).toBe('[{"key":"status"}]')
    })
  )

  it.effect("omits absent filtered-view optional fields", () =>
    Effect.gen(function* () {
      const {
        filterClass: _omittedFilterClass,
        sharable: _omittedSharable,
        viewletId: _omittedViewletId,
        viewOptions: _omittedViewOptions,
        ...minimal
      } = makeFilteredView({ _id: toRef<FilteredView>("filtered-view-minimal"), name: "Minimal" })
      const fixture = createLayer({ filteredViews: [minimal] })

      const listed = yield* listFilteredViews({}).pipe(Effect.provide(fixture))
      expect(listed.filteredViews[0]).not.toHaveProperty("sharable")
      expect(listed.filteredViews[0]).not.toHaveProperty("viewletId")

      const detailed = yield* getFilteredView({ filteredView: fv("Minimal") }).pipe(Effect.provide(fixture))
      expect(detailed).not.toHaveProperty("sharable")
      expect(detailed).not.toHaveProperty("viewletId")
      expect(detailed).not.toHaveProperty("viewOptions")
      expect(detailed).not.toHaveProperty("filterClass")
    })
  )

  it.effect("fails missing and ambiguous filtered-view locators", () =>
    Effect.gen(function* () {
      const ambiguous = createLayer({
        filteredViews: [makeFilteredView(), makeFilteredView({ _id: toRef<FilteredView>("filtered-view-2") })]
      })

      expect(
        yield* Effect.flip(getFilteredView({ filteredView: fv("Mine") }).pipe(Effect.provide(ambiguous)))
      ).toBeInstanceOf(FilteredViewIdentifierAmbiguousError)

      expect(
        yield* Effect.flip(getFilteredView({ filteredView: fv("Missing") }).pipe(Effect.provide(createLayer())))
      ).toBeInstanceOf(FilteredViewNotFoundError)
    })
  )

  it.effect("lists viewlets with descriptors and preferences", () =>
    Effect.gen(function* () {
      const fixture = createLayer()

      const listed = yield* runWithDiagnostics(listViewlets({ attachTo: attachTo(String(board.class.Card)) }), fixture)

      expect(listed.viewlets.map((item) => item.title)).toEqual(["Kanban", "Table"])
      expect(listed.viewlets[0]?.descriptorInfo?.label).toBe("view:string:Kanban")
      expect(listed.viewlets[0]?.preferences[0]?.config).toEqual(["title"])
    })
  )

  it.effect("resolves viewlet locators and omits blank optional metadata", () =>
    Effect.gen(function* () {
      const { color: _omittedColor, ...blankDescriptor } = makeDescriptor({
        _id: toRef<ViewletDescriptor>("descriptor-blank"),
        label: intl(" "),
        component: component("view:component:Blank")
      })
      const { props: _omittedProps, ...blankViewlet } = makeViewlet({
        _id: toRef<Viewlet>("viewlet-blank"),
        descriptor: toRef<ViewletDescriptor>("descriptor-blank"),
        title: " ",
        variant: " "
      })
      const fixture = createLayer({
        viewlets: [
          makeViewlet({
            baseQuery: { title: "Planning" },
            options: { limit: 1 },
            configOptions: { hiddenKeys: ["status"] },
            viewOptions: { groupBy: ["status"], orderBy: [], other: [], groupDepth: 1 },
            masterDetailOptions: {
              views: [{ class: boardCardClass, view: toRef<ViewletDescriptor>("descriptor-kanban") }]
            }
          }),
          makeViewlet({
            _id: toRef<Viewlet>("viewlet-table"),
            descriptor: view.viewlet.Table,
            title: "Table",
            variant: "table"
          }),
          makeViewlet({
            _id: toRef<Viewlet>("viewlet-table-list"),
            descriptor: view.viewlet.Table,
            title: "Table list",
            variant: "table-list"
          }),
          blankViewlet
        ],
        descriptors: [
          makeDescriptor({ hidden: true, icon: view.icon.Table, readonly: true }),
          makeDescriptor({
            _id: view.viewlet.Table,
            label: intl("view:string:Table"),
            component: component("view:component:Table")
          }),
          blankDescriptor
        ],
        preferences: []
      })

      const byId = yield* runWithDiagnostics(listViewlets({ viewlet: v("viewlet-kanban") }), fixture)
      expect(byId.viewlets[0]?.baseQuery).toEqual({ title: "Planning" })
      expect(byId.viewlets[0]?.descriptorInfo).toMatchObject({
        hidden: true,
        icon: String(view.icon.Table),
        readonly: true
      })

      const byVariant = yield* runWithDiagnostics(listViewlets({ viewlet: v("table") }), fixture)
      expect(byVariant.viewlets[0]?.id).toBe("viewlet-table")

      const byDescriptor = yield* runWithDiagnostics(listViewlets({ viewlet: v(String(view.viewlet.Table)) }), fixture)
      expect(byDescriptor.viewlets.map((item) => item.id)).toEqual(["viewlet-table", "viewlet-table-list"])

      const blank = yield* runWithDiagnostics(listViewlets({ viewlet: v("viewlet-blank") }), fixture)
      expect(blank.viewlets[0]).not.toHaveProperty("title")
      expect(blank.viewlets[0]).not.toHaveProperty("variant")
      expect(blank.viewlets[0]).not.toHaveProperty("props")
      expect(blank.viewlets[0]?.descriptorInfo).not.toHaveProperty("label")
      expect(blank.viewlets[0]?.descriptorInfo).not.toHaveProperty("color")
    })
  )

  it.effect("fails missing or ambiguous viewlet locators and handles empty metadata", () =>
    Effect.gen(function* () {
      const ambiguous = createLayer({
        viewlets: [makeViewlet(), makeViewlet({ _id: toRef<Viewlet>("viewlet-kanban-2") })]
      })

      expect(yield* Effect.flip(runWithDiagnostics(listViewlets({ viewlet: v("Kanban") }), ambiguous))).toBeInstanceOf(
        ViewletIdentifierAmbiguousError
      )

      expect(
        yield* Effect.flip(runWithDiagnostics(listViewlets({ viewlet: v("Missing") }), createLayer()))
      ).toBeInstanceOf(ViewletNotFoundError)

      const empty = yield* runWithDiagnostics(
        listViewlets({}),
        createLayer({ viewlets: [], descriptors: [], preferences: [] })
      )
      expect(empty).toEqual({ viewlets: [], total: 0 })

      const { result: missingDescriptor, warnings } = yield* runWithWarnings(
        listViewlets({ limit: 1 }),
        createLayer({ descriptors: [], preferences: [] })
      )
      expect(missingDescriptor.viewlets[0]).not.toHaveProperty("descriptorInfo")
      expect(warnings).toHaveLength(1)
      expect(warnings[0]?.code).toBe("viewlet_descriptor_metadata_degraded")
      expect(warnings[0]?.message).toContain("descriptor-kanban")
    })
  )
})
