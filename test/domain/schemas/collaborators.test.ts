import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import { parseAddObjectCollaboratorParams, parseListObjectCollaboratorsParams } from "../../../src/domain/schemas.js"

describe("collaborator schemas", () => {
  it.effect("enforces exactly one object target locator", () =>
    Effect.gen(function* () {
      const raw = yield* parseListObjectCollaboratorsParams({ objectId: "issue-1", objectClass: "tracker:class:Issue" })
      const issue = yield* parseAddObjectCollaboratorParams({
        project: "HULY",
        issueIdentifier: "HULY-1",
        member: "person@example.com"
      })
      const missingRawClass = yield* Effect.result(parseListObjectCollaboratorsParams({ objectId: "issue-1" }))
      const missingIssueIdentifier = yield* Effect.result(parseListObjectCollaboratorsParams({ project: "HULY" }))
      const missingDocument = yield* Effect.result(parseListObjectCollaboratorsParams({ teamspace: "Engineering" }))
      const conflicting = yield* Effect.result(
        parseListObjectCollaboratorsParams({
          objectId: "issue-1",
          objectClass: "tracker:class:Issue",
          project: "HULY",
          issueIdentifier: "HULY-1"
        })
      )

      expect(raw.objectId).toBe("issue-1")
      expect(issue.member).toBe("person@example.com")
      expect(missingRawClass._tag).toBe("Failure")
      expect(missingIssueIdentifier._tag).toBe("Failure")
      expect(missingDocument._tag).toBe("Failure")
      expect(conflicting._tag).toBe("Failure")
    })
  )
})
