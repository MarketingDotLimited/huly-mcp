import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import {
  CreateTaskTypeParamsSchema,
  createIssueStatusParamsJsonSchema,
  parseCreateIssueStatusParams,
  parseCreateTaskTypeParams,
  parseGetProjectTypeParams
} from "../../src/domain/schemas/task-management.js"

describe("task management schemas", () => {
  it.effect("preserves ordinary optional task-type fields and encoded omission", () =>
    Effect.gen(function* () {
      const withExplicitUndefined = yield* parseCreateTaskTypeParams({
        name: "Bug",
        projectType: undefined,
        templateTaskType: undefined
      })
      const withoutOptionals = yield* parseCreateTaskTypeParams({ name: "Bug" })
      const encoded = yield* Schema.encodeUnknownEffect(CreateTaskTypeParamsSchema)(withoutOptionals)

      expect(Object.hasOwn(withExplicitUndefined, "projectType")).toBe(true)
      expect(withExplicitUndefined.projectType).toBeUndefined()
      expect(Object.hasOwn(encoded, "projectType")).toBe(false)
      expect(Object.hasOwn(encoded, "templateTaskType")).toBe(false)
    })
  )

  it.effect("accepts project type and task type display-name refs", () =>
    Effect.gen(function* () {
      const projectType = yield* parseGetProjectTypeParams({ projectType: "Classic" })
      const taskType = yield* parseCreateTaskTypeParams({
        projectType: "Classic",
        name: "Bug",
        templateTaskType: "Issue"
      })

      expect(projectType.projectType).toBe("Classic")
      expect(taskType.templateTaskType).toBe("Issue")
    })
  )

  it.effect("rejects invalid create_issue_status categories", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(parseCreateIssueStatusParams({ name: "QA", category: "unknown" }))

      expect(result._tag).toBe("Failure")
    })
  )

  it.effect("normalizes create_issue_status category casing", () =>
    Effect.gen(function* () {
      const result = yield* parseCreateIssueStatusParams({ name: "QA", category: "active" })

      expect(result.category).toBe("Active")
    })
  )

  it.effect("rejects category spelling variants beyond casing", () =>
    Effect.gen(function* () {
      const dashed = yield* Effect.result(parseCreateIssueStatusParams({ name: "QA", category: "to-do" }))
      const underscored = yield* Effect.result(parseCreateIssueStatusParams({ name: "QA", category: "to_do" }))
      const spaced = yield* Effect.result(parseCreateIssueStatusParams({ name: "QA", category: "to do" }))

      expect(dashed._tag).toBe("Failure")
      expect(underscored._tag).toBe("Failure")
      expect(spaced._tag).toBe("Failure")
    })
  )

  it.effect("exposes the create_issue_status category enum in JSON schema", () =>
    Effect.sync(function () {
      expect(JSON.stringify(createIssueStatusParamsJsonSchema)).toContain("UnStarted")
      expect(JSON.stringify(createIssueStatusParamsJsonSchema)).toContain("Lost")
      expect(JSON.stringify(createIssueStatusParamsJsonSchema)).not.toContain("unknown")
    })
  )
})
