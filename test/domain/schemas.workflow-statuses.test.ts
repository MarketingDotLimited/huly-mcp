import { describe, it } from "@effect/vitest"
import { Effect, Exit } from "effect"
import { expect } from "vitest"

import {
  parseCreateStatusCategoryParams,
  parseCreateWorkflowStatusParams,
  parseUpdateStatusCategoryParams,
  parseUpdateWorkflowStatusParams,
  updateStatusCategoryParamsJsonSchema,
  updateWorkflowStatusParamsJsonSchema
} from "../../src/domain/schemas/workflow-statuses.js"

describe("workflow status schemas", () => {
  it.effect("parses relationship-aware status creation", () =>
    Effect.gen(function* () {
      const params = yield* parseCreateWorkflowStatusParams({
        ofAttribute: "tracker:attribute:IssueStatus",
        name: "Ready for review",
        category: "task:statusCategory:Active",
        color: 7,
        description: "Awaiting review"
      })

      expect(params).toEqual({
        ofAttribute: "tracker:attribute:IssueStatus",
        name: "Ready for review",
        category: "task:statusCategory:Active",
        color: 7,
        description: "Awaiting review"
      })
    })
  )

  it.effect("allows explicit clearing of optional status relationships and metadata", () =>
    Effect.gen(function* () {
      const params = yield* parseUpdateWorkflowStatusParams({
        status: "Ready for review",
        category: null,
        color: null,
        description: null
      })

      expect(params.category).toBeNull()
      expect(params.color).toBeNull()
      expect(params.description).toBeNull()
    })
  )

  it.effect("rejects status updates without changed fields", () =>
    Effect.gen(function* () {
      const exit = yield* parseUpdateWorkflowStatusParams({ status: "Ready for review" }).pipe(Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
    })
  )

  it.effect("parses complete category creation", () =>
    Effect.gen(function* () {
      const params = yield* parseCreateStatusCategoryParams({
        ofAttribute: "tracker:attribute:IssueStatus",
        label: "Review",
        defaultStatus: "Ready for review",
        icon: "core:icon:TypeString",
        color: [4, 8],
        order: 6
      })

      expect(params.label).toBe("Review")
      expect(params.defaultStatus).toBe("Ready for review")
      expect(params.color).toEqual([4, 8])
    })
  )

  it.effect("rejects category updates without changed fields", () =>
    Effect.gen(function* () {
      const exit = yield* parseUpdateStatusCategoryParams({ category: "Review" }).pipe(Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
    })
  )

  it.effect("accepts category updates with a changed field", () =>
    Effect.gen(function* () {
      const params = yield* parseUpdateStatusCategoryParams({ category: "Review", order: 3 })

      expect(params.order).toBe(3)
    })
  )

  it("advertises every relationship update field in JSON Schema", () => {
    expect(updateWorkflowStatusParamsJsonSchema).toHaveProperty("anyOf")
    expect(JSON.stringify(updateWorkflowStatusParamsJsonSchema)).toContain("ofAttribute")
    expect(JSON.stringify(updateWorkflowStatusParamsJsonSchema)).toContain("category")
    expect(updateStatusCategoryParamsJsonSchema).toHaveProperty("anyOf")
    expect(JSON.stringify(updateStatusCategoryParamsJsonSchema)).toContain("defaultStatus")
  })
})
