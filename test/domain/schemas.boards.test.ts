import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import {
  BoardLabelMutationResultSchema,
  BoardLabelSummarySchema,
  createBoardLabelParamsJsonSchema,
  listBoardLabelsParamsJsonSchema,
  parseAddBoardCardLabelParams,
  parseBoardCardLabelParams,
  parseCreateBoardLabelParams,
  parseDeleteBoardLabelParams,
  parseListBoardLabelsParams,
  parseRemoveBoardCardLabelParams,
  parseUpdateBoardLabelParams,
  updateBoardLabelParamsJsonSchema
} from "../../src/domain/schemas/board-labels.js"
import {
  BoardCommonPreferenceResultSchema,
  BoardSavedViewDetailSchema,
  getBoardSavedViewParamsJsonSchema,
  parseGetBoardSavedViewParams,
  parseListBoardMenuPagesParams,
  parseListBoardSavedViewsParams,
  parseListBoardViewletsParams
} from "../../src/domain/schemas/board-views.js"
import { BoardCardSummarySchema, CreateBoardCardResultSchema } from "../../src/domain/schemas/boards-results.js"
import {
  createBoardParamsJsonSchema,
  createBoardCardParamsJsonSchema,
  parseBoardCardMutationParams,
  parseBoardMutationParams,
  parseCreateBoardCardParams,
  parseGetBoardCardParams,
  parseGetBoardParams,
  parseUpdateBoardCardParams,
  parseUpdateBoardParams,
  updateBoardCardParamsJsonSchema,
  updateBoardParamsJsonSchema
} from "../../src/domain/schemas/boards.js"
import {
  createCardParamsJsonSchema,
  listCardsParamsJsonSchema,
  updateCardParamsJsonSchema
} from "../../src/domain/schemas/cards.js"
import { parseJsonSchemaRecord } from "../../src/domain/schemas/json-schema.js"

const getPropertyDescription = (schema: unknown, property: string): unknown => {
  const properties = parseJsonSchemaRecord(parseJsonSchemaRecord(schema)?.properties)
  return parseJsonSchemaRecord(properties?.[property])?.description
}

describe("board schemas", () => {
  const strictParseOptions = { onExcessProperty: "error" } as const

  it.effect("accepts board and board card locator forms", () =>
    Effect.gen(function* () {
      expect((yield* parseGetBoardParams({ board: "Roadmap" })).board).toBe("Roadmap")
      expect((yield* parseBoardMutationParams({ board: "board-id-1" })).board).toBe("board-id-1")
      expect((yield* parseGetBoardCardParams({ board: "Roadmap", card: "card-id-1" })).card).toBe("card-id-1")
      expect((yield* parseGetBoardCardParams({ board: "Roadmap", card: "CARD-123" })).card).toBe("CARD-123")
      expect((yield* parseGetBoardCardParams({ board: "Roadmap", card: "123" })).card).toBe("123")
      expect((yield* parseBoardCardMutationParams({ board: "Roadmap", card: "Planning" })).card).toBe("Planning")
      expect((yield* parseDeleteBoardLabelParams({ label: "Urgent" })).label).toBe("Urgent")
      expect((yield* parseBoardCardLabelParams({ board: "Roadmap", card: "CARD-1" })).card).toBe("CARD-1")
      expect((yield* parseGetBoardSavedViewParams({ savedView: "Mine" })).savedView).toBe("Mine")
    })
  )

  it.effect("accepts board label and view discovery params", () =>
    Effect.gen(function* () {
      expect((yield* parseListBoardLabelsParams({ titleSearch: "Urg", category: "Other", limit: 5 })).category).toBe(
        "Other"
      )
      expect((yield* parseCreateBoardLabelParams({ title: "Urgent", color: 3 })).title).toBe("Urgent")
      expect((yield* parseUpdateBoardLabelParams({ label: "Urgent", description: null })).description).toBeNull()
      expect((yield* parseAddBoardCardLabelParams({ board: "Roadmap", card: "CARD-1", label: "Urgent" })).label).toBe(
        "Urgent"
      )
      expect((yield* parseRemoveBoardCardLabelParams({ board: "Roadmap", card: "CARD-1", label: "Urgent" })).card).toBe(
        "CARD-1"
      )
      expect((yield* parseListBoardMenuPagesParams({ page: "main" })).page).toBe("main")
      expect((yield* parseListBoardSavedViewsParams({ visibility: "own", nameSearch: "Mine" })).visibility).toBe("own")
      expect((yield* parseListBoardViewletsParams({ viewlet: "table" })).viewlet).toBe("table")
    })
  )

  it.effect("accepts clearable update fields and member mutation fields", () =>
    Effect.gen(function* () {
      const boardUpdate = yield* parseUpdateBoardParams({
        board: "Roadmap",
        description: null,
        name: "Next Roadmap",
        private: true
      })
      const parsed = yield* parseUpdateBoardCardParams({
        board: "Roadmap",
        card: "CARD-1",
        description: null,
        assignee: null,
        location: null,
        cover: null,
        startDate: null,
        dueDate: null,
        addMembers: ["alice@example.com"],
        removeMembers: ["bob@example.com"]
      })

      expect(boardUpdate.name).toBe("Next Roadmap")
      expect(boardUpdate.description).toBeNull()
      expect(boardUpdate.private).toBe(true)
      expect(parsed.description).toBeNull()
      expect(parsed.assignee).toBeNull()
      expect(parsed.cover).toBeNull()
      expect(parsed.addMembers).toEqual(["alice@example.com"])
      expect(parsed.removeMembers).toEqual(["bob@example.com"])
    })
  )

  it.effect("rejects empty locators", () =>
    Effect.gen(function* () {
      const emptyBoard = yield* Effect.result(parseGetBoardParams({ board: "" }))
      const emptyCard = yield* Effect.result(parseGetBoardCardParams({ board: "Roadmap", card: "" }))
      const emptyLabel = yield* Effect.result(parseDeleteBoardLabelParams({ label: "" }))
      const emptySavedView = yield* Effect.result(parseGetBoardSavedViewParams({ savedView: "" }))
      const emptyViewlet = yield* Effect.result(parseListBoardViewletsParams({ viewlet: "" }))

      expect(emptyBoard._tag).toBe("Failure")
      expect(emptyCard._tag).toBe("Failure")
      expect(emptyLabel._tag).toBe("Failure")
      expect(emptySavedView._tag).toBe("Failure")
      expect(emptyViewlet._tag).toBe("Failure")
    })
  )

  it.effect("rejects invalid cover size and color", () =>
    Effect.gen(function* () {
      const badSize = yield* Effect.result(
        parseCreateBoardCardParams({ board: "Roadmap", title: "Plan", cover: { color: 1, size: "medium" } })
      )
      const badColor = yield* Effect.result(
        parseCreateBoardCardParams({ board: "Roadmap", title: "Plan", cover: { color: 24, size: "small" } })
      )
      const badLabelColor = yield* Effect.result(parseCreateBoardLabelParams({ title: "Urgent", color: 24 }))

      expect(badSize._tag).toBe("Failure")
      expect(badColor._tag).toBe("Failure")
      expect(badLabelColor._tag).toBe("Failure")
    })
  )

  it.effect("rejects replacing members while adding or removing members", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        parseUpdateBoardCardParams({
          board: "Roadmap",
          card: "CARD-1",
          members: ["alice@example.com"],
          addMembers: ["bob@example.com"]
        })
      )
      const removeResult = yield* Effect.result(
        parseUpdateBoardCardParams({
          board: "Roadmap",
          card: "CARD-1",
          members: ["alice@example.com"],
          removeMembers: ["bob@example.com"]
        })
      )

      expect(result._tag).toBe("Failure")
      expect(removeResult._tag).toBe("Failure")
    })
  )

  it.effect("rejects updates without mutable fields", () =>
    Effect.gen(function* () {
      const boardResult = yield* Effect.result(parseUpdateBoardParams({ board: "Roadmap" }))
      const cardResult = yield* Effect.result(parseUpdateBoardCardParams({ board: "Roadmap", card: "CARD-1" }))
      const labelResult = yield* Effect.result(parseUpdateBoardLabelParams({ label: "Urgent" }))

      expect(boardResult._tag).toBe("Failure")
      expect(cardResult._tag).toBe("Failure")
      expect(labelResult._tag).toBe("Failure")
    })
  )

  it.effect("exposes useful JSON schema descriptions for LLM single-call use", () =>
    Effect.sync(function () {
      const createSchemaText = JSON.stringify(createBoardCardParamsJsonSchema)
      const updateSchemaText = JSON.stringify(updateBoardCardParamsJsonSchema)
      const labelsSchemaText = JSON.stringify(listBoardLabelsParamsJsonSchema)
      const updateLabelSchemaText = JSON.stringify(updateBoardLabelParamsJsonSchema)
      const savedViewSchemaText = JSON.stringify(getBoardSavedViewParamsJsonSchema)

      expect(createSchemaText).toContain("CARD-number sequence")
      expect(createSchemaText).toContain("exact email")
      expect(updateSchemaText).toContain("null clears")
      expect(updateSchemaText).toContain("Cannot be combined with addMembers")
      expect(labelsSchemaText).toContain("board-card tags")
      expect(updateLabelSchemaText).toContain("title, color, description, category")
      expect(savedViewSchemaText).toContain("attachedTo = board.app.Board")
      expect(getPropertyDescription(createBoardParamsJsonSchema, "description")).toBe("Plain text board description.")
      expect(getPropertyDescription(updateBoardParamsJsonSchema, "description")).toBe(
        "New plain text board description; null clears it."
      )
      expect(getPropertyDescription(createBoardLabelParamsJsonSchema, "description")).toBe("Board label description.")
      expect(getPropertyDescription(updateBoardLabelParamsJsonSchema, "description")).toBe(
        "New board label description; null clears it."
      )
      expect(getPropertyDescription(createCardParamsJsonSchema, "title")).toBe("Card title.")
      expect(getPropertyDescription(updateCardParamsJsonSchema, "title")).toBe("New card title.")
      expect(parseJsonSchemaRecord(listCardsParamsJsonSchema)?.not).toEqual({ required: ["titleSearch", "titleRegex"] })
      expect(parseJsonSchemaRecord(updateBoardCardParamsJsonSchema)?.allOf).toEqual([
        { not: { required: ["members", "addMembers"] } },
        { not: { required: ["members", "removeMembers"] } }
      ])
    })
  )

  it.effect("validates board card output identifiers and semantic text fields", () =>
    Effect.gen(function* () {
      const payload = {
        id: "card-id-1",
        identifier: "CARD-123",
        number: 123,
        title: "Planning",
        board: "Roadmap",
        status: "Todo",
        statusId: "status-id-1",
        kind: "Card",
        kindId: "task-type-id-1",
        archived: false
      }

      expect((yield* Schema.decodeUnknownEffect(BoardCardSummarySchema)(payload)).identifier).toBe("CARD-123")

      const malformedIdentifier = yield* Effect.result(
        Schema.decodeUnknownEffect(CreateBoardCardResultSchema)({
          id: "card-id-2",
          identifier: "TASK-123",
          number: 123,
          title: "Planning"
        })
      )
      const emptyTitle = yield* Effect.result(
        Schema.decodeUnknownEffect(BoardCardSummarySchema)({ ...payload, title: "" })
      )
      const emptyBoard = yield* Effect.result(
        Schema.decodeUnknownEffect(BoardCardSummarySchema)({ ...payload, board: "" })
      )

      expect(malformedIdentifier._tag).toBe("Failure")
      expect(emptyTitle._tag).toBe("Failure")
      expect(emptyBoard._tag).toBe("Failure")
    })
  )

  it.effect("validates saved-view output while preserving SDK-open payloads", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(BoardSavedViewDetailSchema)({
        id: "saved-view-1",
        name: "Mine",
        visibility: "own",
        attachedTo: "board:app:Board",
        location: { path: ["board"] },
        filters: '[{"key":"status"}]',
        viewOptions: { groupBy: ["status"], orderBy: { key: "modifiedOn", order: "desc" } },
        viewletId: "viewlet-1",
        users: 1,
        createdBy: "person-1"
      })

      expect(decoded.filters).toBe('[{"key":"status"}]')
      expect(decoded.viewOptions).toEqual({ groupBy: ["status"], orderBy: { key: "modifiedOn", order: "desc" } })
    })
  )

  it.effect("validates board label output category as a resolved tag category id", () =>
    Effect.gen(function* () {
      const payload = { id: "label-1", title: "Urgent", description: "", color: 3, category: "board:category:Other" }

      expect((yield* Schema.decodeUnknownEffect(BoardLabelSummarySchema)(payload)).category).toBe(
        "board:category:Other"
      )
      expect(
        (yield* Effect.result(Schema.decodeUnknownEffect(BoardLabelSummarySchema)({ ...payload, category: "" })))._tag
      ).toBe("Failure")
    })
  )

  it.effect("rejects impossible board label and common preference result states", () =>
    Effect.gen(function* () {
      const labelWithMultipleFlags = yield* Effect.result(
        Schema.decodeUnknownEffect(
          BoardLabelMutationResultSchema,
          strictParseOptions
        )({ id: "label-1", title: "Urgent", created: true, updated: true })
      )
      const missingPresentPreferenceFields = yield* Effect.result(
        Schema.decodeUnknownEffect(BoardCommonPreferenceResultSchema)({ present: true, attachedTo: "board:app:Board" })
      )
      const absentPreferenceWithRaw = yield* Effect.result(
        Schema.decodeUnknownEffect(
          BoardCommonPreferenceResultSchema,
          strictParseOptions
        )({ present: false, attachedTo: "board:app:Board", raw: {} })
      )

      expect(labelWithMultipleFlags._tag).toBe("Failure")
      expect(missingPresentPreferenceFields._tag).toBe("Failure")
      expect(absentPreferenceWithRaw._tag).toBe("Failure")
    })
  )
})
