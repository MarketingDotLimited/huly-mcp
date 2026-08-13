import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import { parseUpdateIssueTemplateParams } from "../../src/domain/schemas/issue-templates.js"

describe("issue template schemas", () => {
  it.effect("rejects an update without authored fields", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(parseUpdateIssueTemplateParams({ project: "HULY", template: "Bug report" }))

      expect(error._tag).toBe("SchemaError")
    })
  )

  it.effect("accepts the last update field and explicit clearing", () =>
    Effect.gen(function* () {
      const estimation = yield* parseUpdateIssueTemplateParams({
        project: "HULY",
        template: "Bug report",
        estimation: 2
      })
      const clearedDescription = yield* parseUpdateIssueTemplateParams({
        project: "HULY",
        template: "Bug report",
        description: null
      })

      expect(estimation.estimation).toBe(2)
      expect(clearedDescription.description).toBeNull()
    })
  )
})
