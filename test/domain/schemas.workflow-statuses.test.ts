import { describe, it } from "@effect/vitest"
import { Effect, Exit, Schema } from "effect"
import { expect } from "vitest"

import { WorkflowStatusSummarySchema } from "../../src/domain/schemas/workflow-status-results.js"
import {
  CreateWorkflowStatusParamsSchema,
  parseCreateStatusCategoryParams,
  parseCreateWorkflowStatusParams,
  parseUpdateStatusCategoryParams,
  parseUpdateWorkflowStatusParams,
  UpdateWorkflowStatusParamsSchema,
  updateStatusCategoryParamsJsonSchema,
  updateWorkflowStatusParamsJsonSchema,
  WorkflowColorSchema,
  WorkflowIconSchema,
  WorkflowLabelSchema
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

  it.effect("preserves ordinary optional fields and encoded omission", () =>
    Effect.gen(function* () {
      const withExplicitUndefined = yield* parseCreateWorkflowStatusParams({
        ofAttribute: "tracker:attribute:IssueStatus",
        name: "Ready for review",
        category: undefined,
        color: undefined,
        description: undefined
      })
      const withoutOptionals = yield* parseCreateWorkflowStatusParams({
        ofAttribute: "tracker:attribute:IssueStatus",
        name: "Ready for review"
      })
      const encoded = yield* Schema.encodeUnknownEffect(CreateWorkflowStatusParamsSchema)(withoutOptionals)

      expect(Object.hasOwn(withExplicitUndefined, "category")).toBe(true)
      expect(withExplicitUndefined.category).toBeUndefined()
      expect(Object.hasOwn(encoded, "category")).toBe(false)
      expect(Object.hasOwn(encoded, "color")).toBe(false)
      expect(Object.hasOwn(encoded, "description")).toBe(false)
    })
  )

  it.effect("preserves ordinary optional workflow result fields", () =>
    Effect.gen(function* () {
      const required = {
        statusId: "status-1",
        name: "Ready for review",
        ofAttribute: {
          attributeId: "tracker:attribute:IssueStatus",
          name: "Issue status",
          ownerClassId: "tracker:class:Issue"
        }
      }
      const explicitUndefined = yield* Schema.decodeUnknownEffect(WorkflowStatusSummarySchema)({
        ...required,
        category: undefined,
        color: undefined,
        description: undefined
      })
      const omitted = yield* Schema.decodeUnknownEffect(WorkflowStatusSummarySchema)(required)
      const encoded = yield* Schema.encodeUnknownEffect(WorkflowStatusSummarySchema)(omitted)

      expect(Object.hasOwn(explicitUndefined, "category")).toBe(true)
      expect(explicitUndefined.category).toBeUndefined()
      expect(Object.hasOwn(encoded, "category")).toBe(false)
      expect(Object.hasOwn(encoded, "color")).toBe(false)
      expect(Object.hasOwn(encoded, "description")).toBe(false)
    })
  )

  it.effect("round-trips workflow icon, label, and color boundary codecs", () =>
    Effect.gen(function* () {
      const icon = yield* Schema.decodeUnknownEffect(WorkflowIconSchema)("core:icon:TypeString")
      const label = yield* Schema.decodeUnknownEffect(WorkflowLabelSchema)("Ready for review")
      const gradient = yield* Schema.decodeUnknownEffect(WorkflowColorSchema)([4, 8])

      expect(yield* Schema.encodeUnknownEffect(WorkflowIconSchema)(icon)).toBe("core:icon:TypeString")
      expect(yield* Schema.encodeUnknownEffect(WorkflowLabelSchema)(label)).toBe("Ready for review")
      expect(yield* Schema.encodeUnknownEffect(WorkflowColorSchema)(gradient)).toEqual([4, 8])
    })
  )

  it.effect("preserves minimum lengths and the authored empty-update message", () =>
    Effect.gen(function* () {
      const emptyIcon = yield* Schema.decodeUnknownEffect(WorkflowIconSchema)("").pipe(Effect.exit)
      const emptyGradient = yield* Schema.decodeUnknownEffect(WorkflowColorSchema)([]).pipe(Effect.exit)
      const emptyUpdate = yield* Schema.decodeUnknownEffect(UpdateWorkflowStatusParamsSchema)({
        status: "Ready for review"
      }).pipe(Effect.flip)

      expect(Exit.isFailure(emptyIcon)).toBe(true)
      expect(Exit.isFailure(emptyGradient)).toBe(true)
      expect(emptyUpdate.message).toContain(
        "At least one update field must be provided: name, ofAttribute, category, color, description."
      )
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
