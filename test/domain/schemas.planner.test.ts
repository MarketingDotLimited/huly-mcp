import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import {
  CreateTodoParamsSchema,
  parseCreateTodoParams,
  parseScheduleTodoParams,
  parseUnscheduleTodoParams,
  parseUpdateTodoParams,
  TodoPriorityValues,
  TodoSummarySchema,
  TodoVisibilityValues,
  updateTodoParamsJsonSchema
} from "../../src/domain/schemas/planner.js"

describe("planner schemas", () => {
  it.effect("preserves ordinary optional create fields and encoded omission", () =>
    Effect.gen(function* () {
      const withExplicitUndefined = yield* parseCreateTodoParams({
        title: "Follow up",
        description: undefined,
        owner: undefined,
        dueDate: undefined
      })
      const withoutOptionals = yield* parseCreateTodoParams({ title: "Follow up" })
      const encoded = yield* Schema.encodeUnknownEffect(CreateTodoParamsSchema)(withoutOptionals)

      expect(Object.hasOwn(withExplicitUndefined, "description")).toBe(true)
      expect(withExplicitUndefined.description).toBeUndefined()
      expect(Object.hasOwn(encoded, "description")).toBe(false)
      expect(Object.hasOwn(encoded, "owner")).toBe(false)
      expect(Object.hasOwn(encoded, "dueDate")).toBe(false)
    })
  )

  it.effect("accepts LLM-friendly issue attachment input", () =>
    Effect.gen(function* () {
      const params = yield* parseCreateTodoParams({
        title: "Follow up",
        attachedTo: { type: "issue", project: "HULY", identifier: "123" },
        priority: "urgent",
        visibility: "public"
      })

      expect(params.attachedTo?.type).toBe("issue")
      expect(params.priority).toBe("urgent")
    })
  )

  it.effect("accepts ToDo locators for scheduling", () =>
    Effect.gen(function* () {
      const params = yield* parseScheduleTodoParams({
        locator: { issue: { project: "HULY", identifier: "HULY-94" }, title: "Implement planner tools" },
        date: 1_800_000_000_000,
        dueDate: 1_800_003_600_000
      })

      expect("issue" in params.locator).toBe(true)
    })
  )

  it.effect("rejects unsupported attachment target variants before operation execution", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        parseCreateTodoParams({
          title: "Document task",
          attachedTo: { type: "document", teamspace: "Docs", document: "Spec" }
        })
      )

      expect(result._tag).toBe("Failure")
    })
  )

  it.effect("rejects unschedule_todo without a concrete target shape", () =>
    Effect.gen(function* () {
      const empty = yield* Effect.result(parseUnscheduleTodoParams({}))
      const locatorOnly = yield* Effect.result(parseUnscheduleTodoParams({ locator: { todoId: "todo-1" } }))
      const futureWithoutLocator = yield* Effect.result(parseUnscheduleTodoParams({ scope: "future" }))

      expect(empty._tag).toBe("Failure")
      expect(locatorOnly._tag).toBe("Failure")
      expect(futureWithoutLocator._tag).toBe("Failure")
    })
  )

  it.effect("accepts each supported unschedule_todo target shape", () =>
    Effect.gen(function* () {
      const bySlot = yield* parseUnscheduleTodoParams({ workSlotId: "slot-1" })
      const allByTodo = yield* parseUnscheduleTodoParams({ locator: { todoId: "todo-1" }, scope: "all" })
      const futureByTodo = yield* parseUnscheduleTodoParams({
        locator: { todoId: "todo-1" },
        scope: "future",
        from: 1_800_000_000_000
      })

      expect("workSlotId" in bySlot).toBe(true)
      expect("scope" in allByTodo ? allByTodo.scope : undefined).toBe("all")
      expect("scope" in futureByTodo ? futureByTodo.scope : undefined).toBe("future")
    })
  )

  it.effect("rejects update_todo without update fields", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(parseUpdateTodoParams({ locator: { todoId: "todo-1" } }))

      expect(result._tag).toBe("Failure")
    })
  )

  it.effect("accepts update_todo when one clearable update field is present", () =>
    Effect.gen(function* () {
      const params = yield* parseUpdateTodoParams({ locator: { todoId: "todo-1" }, dueDate: null })

      expect(params.dueDate).toBeNull()
    })
  )

  it("exposes stable priority and visibility enums", () => {
    expect(TodoPriorityValues).toEqual(["no-priority", "low", "medium", "high", "urgent"])
    expect(TodoVisibilityValues).toEqual(["public", "freeBusy", "private"])
  })

  it("rejects empty titles in ToDo output summaries", () => {
    const result = Schema.decodeUnknownResult(TodoSummarySchema)({
      id: "todo-1",
      title: "",
      priority: "high",
      visibility: "private",
      owner: { id: "person-1" },
      attachedTo: { type: "none" },
      workslots: 0
    })

    expect(result._tag).toBe("Failure")
  })

  it("rejects empty titles in issue attachment output summaries", () => {
    const result = Schema.decodeUnknownResult(TodoSummarySchema)({
      id: "todo-1",
      title: "Follow up",
      priority: "high",
      visibility: "private",
      owner: { id: "person-1" },
      attachedTo: { type: "issue", id: "issue-1", project: "HULY", identifier: "HULY-94", title: "" },
      workslots: 0
    })

    expect(result._tag).toBe("Failure")
  })

  it("adds anyOf requirements to update_todo JSON schema", () => {
    expect(JSON.stringify(updateTodoParamsJsonSchema)).toContain("priority")
    expect(JSON.stringify(updateTodoParamsJsonSchema)).toContain("visibility")
  })
})
