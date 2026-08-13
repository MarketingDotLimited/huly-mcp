import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import {
  ActivityMessageWireSchema,
  AddReactionResultSchema,
  CreateWorkspaceResultSchema,
  ListMentionsResultSchema,
  ListReactionsResultSchema,
  ListSavedMessagesResultSchema,
  LogTimeResultSchema,
  SaveMessageResultSchema,
  StopTimerResultSchema,
  TimeSpendReportWireSchema,
  WorkSlotWireSchema,
  WorkspaceInfoSchema,
  WorkspaceMemberSchema
} from "../../src/domain/schemas.js"

describe("branded output schemas", () => {
  it.effect("keeps time output payloads JSON-compatible while validating branded IDs", () =>
    Effect.gen(function* () {
      const report = yield* Schema.decodeUnknownEffect(TimeSpendReportWireSchema)({
        id: "report-1",
        identifier: "HULY-1",
        employee: "Alice",
        date: 1700000000000,
        value: 30,
        description: "Implementation"
      })
      const slot = yield* Schema.decodeUnknownEffect(WorkSlotWireSchema)({
        id: "slot-1",
        todoId: "todo-1",
        date: 1700000000000,
        dueDate: 1700003600000,
        title: "Focus"
      })
      const logged = yield* Schema.decodeUnknownEffect(LogTimeResultSchema)({
        reportId: "report-2",
        identifier: "HULY-2"
      })
      const stopped = yield* Schema.decodeUnknownEffect(StopTimerResultSchema)({
        identifier: "HULY-3",
        stoppedAt: 1700000000000,
        reportId: "report-3"
      })

      expect(report.id).toBe("report-1")
      expect(slot.id).toBe("slot-1")
      expect(logged.reportId).toBe("report-2")
      expect(stopped.reportId).toBe("report-3")
    })
  )

  it.effect("keeps workspace output payloads JSON-compatible while validating branded IDs", () =>
    Effect.gen(function* () {
      const member = yield* Schema.decodeUnknownEffect(WorkspaceMemberSchema)({
        personId: "person-uuid-1",
        role: "OWNER",
        name: "Alice",
        email: "alice@example.test"
      })
      const workspace = yield* Schema.decodeUnknownEffect(WorkspaceInfoSchema)({
        uuid: "workspace-uuid-1",
        name: "Product",
        url: "product",
        region: "us-east",
        createdOn: 1700000000000,
        allowReadOnlyGuest: true,
        allowGuestSignUp: false,
        version: "1.2.3",
        mode: "active"
      })
      const created = yield* Schema.decodeUnknownEffect(CreateWorkspaceResultSchema)({
        uuid: "workspace-uuid-2",
        url: "new-product",
        name: "New Product"
      })

      expect(member.personId).toBe("person-uuid-1")
      expect(workspace.uuid).toBe("workspace-uuid-1")
      expect(workspace.region).toBe("us-east")
      expect(created.uuid).toBe("workspace-uuid-2")
      expect(created.url).toBe("new-product")
    })
  )

  it.effect("keeps activity output payloads JSON-compatible while validating branded IDs", () =>
    Effect.gen(function* () {
      const messagePayload = {
        id: "activity-1",
        objectId: "issue-1",
        objectClass: "tracker:class:Issue",
        modifiedBy: "person-1",
        modifiedOn: 1700000000000,
        isPinned: false,
        replies: 1,
        reactions: 2,
        editedOn: null,
        action: "update",
        message: "Changed priority"
      }
      const message = yield* Schema.decodeUnknownEffect(ActivityMessageWireSchema)(messagePayload)
      const encodedMessage = yield* Schema.encodeUnknownEffect(ActivityMessageWireSchema)(message)
      const reactionPayloads = [
        { id: "reaction-1", messageId: "activity-1", emoji: ":thumbsup:", createdBy: "person-1" }
      ]
      const reactions = yield* Schema.decodeUnknownEffect(ListReactionsResultSchema)(reactionPayloads)
      const encodedReactions = yield* Schema.encodeUnknownEffect(ListReactionsResultSchema)(reactions)
      const savedPayloads = [{ id: "saved-1", messageId: "activity-1" }]
      const saved = yield* Schema.decodeUnknownEffect(ListSavedMessagesResultSchema)(savedPayloads)
      const encodedSaved = yield* Schema.encodeUnknownEffect(ListSavedMessagesResultSchema)(saved)
      const mentionPayloads = [
        { id: "mention-1", messageId: "activity-1", userId: "person-2", content: "Please review" }
      ]
      const mentions = yield* Schema.decodeUnknownEffect(ListMentionsResultSchema)(mentionPayloads)
      const encodedMentions = yield* Schema.encodeUnknownEffect(ListMentionsResultSchema)(mentions)
      const addReactionPayload = { reactionId: "reaction-2", messageId: "activity-1" }
      const added = yield* Schema.decodeUnknownEffect(AddReactionResultSchema)(addReactionPayload)
      const encodedAdded = yield* Schema.encodeUnknownEffect(AddReactionResultSchema)(added)
      const saveMessagePayload = { savedId: "saved-2", messageId: "activity-1" }
      const savedResult = yield* Schema.decodeUnknownEffect(SaveMessageResultSchema)(saveMessagePayload)
      const encodedSavedResult = yield* Schema.encodeUnknownEffect(SaveMessageResultSchema)(savedResult)

      expect(message.id).toBe("activity-1")
      expect(message.objectId).toBe("issue-1")
      expect(encodedMessage).toEqual(messagePayload)
      expect(reactions[0]?.id).toBe("reaction-1")
      expect(encodedReactions).toEqual(reactionPayloads)
      expect(saved[0]?.id).toBe("saved-1")
      expect(encodedSaved).toEqual(savedPayloads)
      expect(mentions[0]?.userId).toBe("person-2")
      expect(encodedMentions).toEqual(mentionPayloads)
      expect(added.reactionId).toBe("reaction-2")
      expect(encodedAdded).toEqual(addReactionPayload)
      expect(savedResult.savedId).toBe("saved-2")
      expect(encodedSavedResult).toEqual(saveMessagePayload)
    })
  )
})
