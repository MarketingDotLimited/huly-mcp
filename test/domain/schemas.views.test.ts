import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import {
  FilteredViewDetailSchema,
  getFilteredViewParamsJsonSchema,
  listFilteredViewsParamsJsonSchema,
  ListViewletsResultSchema,
  parseGetFilteredViewParams,
  parseListFilteredViewsParams,
  parseListViewletsParams
} from "../../src/domain/schemas.js"

describe("view schemas", () => {
  it.effect("accepts generic filtered view and viewlet discovery params", () =>
    Effect.gen(function* () {
      const listed = yield* parseListFilteredViewsParams({
        attachedTo: "board:app:Board",
        visibility: "own",
        nameSearch: "Mine",
        limit: 5
      })
      const detailed = yield* parseGetFilteredViewParams({ filteredView: "Mine", attachedTo: "board:app:Board" })
      const viewlets = yield* parseListViewletsParams({ attachTo: "board:class:Card", viewlet: "table" })

      expect(listed.attachedTo).toBe("board:app:Board")
      expect(listed.visibility).toBe("own")
      expect(detailed.filteredView).toBe("Mine")
      expect(viewlets.attachTo).toBe("board:class:Card")
      expect(viewlets.viewlet).toBe("table")
    })
  )

  it.effect("rejects empty locators and unsupported visibility", () =>
    Effect.gen(function* () {
      const emptyFilteredView = yield* Effect.either(parseGetFilteredViewParams({ filteredView: "" }))
      const emptyAttachedTo = yield* Effect.either(parseListFilteredViewsParams({ attachedTo: "" }))
      const invalidVisibility = yield* Effect.either(parseListFilteredViewsParams({ visibility: "private" }))
      const emptyAttachTo = yield* Effect.either(parseListViewletsParams({ attachTo: "" }))
      const emptyViewlet = yield* Effect.either(parseListViewletsParams({ viewlet: "" }))

      expect(emptyFilteredView._tag).toBe("Left")
      expect(emptyAttachedTo._tag).toBe("Left")
      expect(invalidVisibility._tag).toBe("Left")
      expect(emptyAttachTo._tag).toBe("Left")
      expect(emptyViewlet._tag).toBe("Left")
    })
  )

  it.effect("validates filtered-view output while preserving SDK-open payloads", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknown(FilteredViewDetailSchema)({
        id: "filtered-view-1",
        name: "Mine",
        visibility: "own",
        attachedTo: "board:app:Board",
        location: { path: ["board"] },
        filters: '[{"key":"status"}]',
        viewOptions: { groupBy: ["status"] },
        filterClass: "board:class:Card",
        viewletId: "viewlet-1",
        users: 1,
        createdBy: "person-1"
      })

      expect(decoded.location).toEqual({ path: ["board"] })
      expect(decoded.filters).toBe('[{"key":"status"}]')
    })
  )

  it.effect("validates viewlet output with descriptor and preference configs", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknown(ListViewletsResultSchema)({
        viewlets: [
          {
            id: "viewlet-1",
            attachTo: "board:class:Card",
            descriptor: "descriptor-1",
            title: "Kanban",
            variant: "kanban",
            config: ["title", { key: "status" }],
            descriptorInfo: { id: "descriptor-1", label: "view:string:Kanban", component: "view:component:Kanban" },
            preferences: [{ id: "pref-1", attachedTo: "viewlet-1", config: ["title"] }]
          }
        ],
        total: 1
      })

      expect(decoded.viewlets[0]?.descriptorInfo?.label).toBe("view:string:Kanban")
      expect(decoded.viewlets[0]?.preferences[0]?.config).toEqual(["title"])
    })
  )

  it.effect("exposes useful JSON schema descriptions for LLM single-call use", () =>
    Effect.sync(function () {
      const listText = JSON.stringify(listFilteredViewsParamsJsonSchema)
      const getText = JSON.stringify(getFilteredViewParamsJsonSchema)

      expect(listText).toContain("board:app:Board")
      expect(getText).toContain("disambiguate exact-name matches")
    })
  )
})
