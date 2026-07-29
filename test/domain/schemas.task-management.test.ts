import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import {
  createIssueStatusParamsJsonSchema,
  parseCreateIssueStatusParams,
  parseCreateTaskTypeParams,
  parseGetProjectTypeParams
} from "../../src/domain/schemas.js"

describe("task management schemas", () => {
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
      const result = yield* Effect.either(parseCreateIssueStatusParams({ name: "QA", category: "unknown" }))

      expect(result._tag).toBe("Left")
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
      const dashed = yield* Effect.either(parseCreateIssueStatusParams({ name: "QA", category: "to-do" }))
      const underscored = yield* Effect.either(parseCreateIssueStatusParams({ name: "QA", category: "to_do" }))
      const spaced = yield* Effect.either(parseCreateIssueStatusParams({ name: "QA", category: "to do" }))

      expect(dashed._tag).toBe("Left")
      expect(underscored._tag).toBe("Left")
      expect(spaced._tag).toBe("Left")
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
