import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import {
  parseUpdateCardParams,
  parseUpdateChannelParams,
  parseUpdateComponentParams,
  parseUpdateEventParams,
  parseUpdateIssueParams,
  parseUpdateIssueTemplateParams,
  parseUpdateLabelParams,
  parseUpdateMilestoneParams,
  parseUpdateSpaceParams,
  parseUpdateTagParams
} from "../../../src/domain/schemas.js"

describe("clear-field update contract", () => {
  it.effect("accepts null for every clearable field added to the public update schemas", () =>
    Effect.gen(function* () {
      const space = yield* parseUpdateSpaceParams({ description: null, space: "General" })
      const channel = yield* parseUpdateChannelParams({ channel: "general", topic: null })
      const event = yield* parseUpdateEventParams({ description: null, eventId: "event-1", location: null })
      const issue = yield* parseUpdateIssueParams({ description: null, identifier: "TEST-1", project: "TEST" })
      const template = yield* parseUpdateIssueTemplateParams({
        description: null,
        estimation: null,
        project: "TEST",
        template: "Bug"
      })
      const component = yield* parseUpdateComponentParams({ component: "Backend", description: null, project: "TEST" })
      const milestone = yield* parseUpdateMilestoneParams({ description: null, milestone: "Sprint 1", project: "TEST" })
      const tag = yield* parseUpdateTagParams({ description: null, tag: "bug", targetClass: "tracker:class:Issue" })
      const label = yield* parseUpdateLabelParams({ description: null, label: "bug" })
      const card = yield* parseUpdateCardParams({ card: "Roadmap", cardSpace: "Cards", content: null })

      expect(space.description).toBeNull()
      expect(channel.topic).toBeNull()
      expect(event.description).toBeNull()
      expect(event.location).toBeNull()
      expect(issue.description).toBeNull()
      expect(template.description).toBeNull()
      expect(template.estimation).toBeNull()
      expect(component.description).toBeNull()
      expect(milestone.description).toBeNull()
      expect(tag.description).toBeNull()
      expect(label.description).toBeNull()
      expect(card.content).toBeNull()
    })
  )
})
