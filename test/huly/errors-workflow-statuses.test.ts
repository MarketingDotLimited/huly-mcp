import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import {
  DocId,
  HulyAttributeId,
  HulyAttributeIdentifier,
  ObjectClassName,
  ProjectTypeId,
  StatusCategoryId,
  StatusCategoryIdentifier,
  StatusName,
  TaskTypeId,
  WorkflowStatusId,
  WorkflowStatusIdentifier
} from "../../src/domain/schemas/shared.js"
import { WorkflowLabelSchema } from "../../src/domain/schemas/workflow-statuses.js"
import {
  WorkflowAttributeIdentifierAmbiguousError,
  WorkflowAttributeNotFoundError,
  WorkflowAttributeUnsupportedError,
  WorkflowRelationshipInvalidError,
  WorkflowStatusCategoryIdentifierAmbiguousError,
  WorkflowStatusCategoryInUseError,
  WorkflowStatusCategoryLabelConflictError,
  WorkflowStatusCategoryNotFoundError,
  WorkflowStatusClassMismatchError,
  WorkflowStatusIdentifierAmbiguousError,
  WorkflowStatusInUseError,
  WorkflowStatusNameConflictError,
  WorkflowStatusNotFoundError
} from "../../src/huly/errors-workflow-statuses.js"

const attributeId = HulyAttributeId.make("attribute-1")
const otherAttributeId = HulyAttributeId.make("attribute-2")
const statusId = WorkflowStatusId.make("status-1")
const otherStatusId = WorkflowStatusId.make("status-2")
const categoryId = StatusCategoryId.make("category-1")
const otherCategoryId = StatusCategoryId.make("category-2")

describe("workflow status errors", () => {
  it.effect("renders actionable locator and relationship errors", () =>
    Effect.sync(() => {
      const messages = [
        new WorkflowAttributeNotFoundError({ identifier: HulyAttributeIdentifier.make("missing") }).message,
        new WorkflowAttributeIdentifierAmbiguousError({
          identifier: HulyAttributeIdentifier.make("status"),
          matches: [
            { attributeId, ownerClassId: ObjectClassName.make("class-1") },
            { attributeId: otherAttributeId, ownerClassId: ObjectClassName.make("class-2") }
          ]
        }).message,
        new WorkflowStatusNotFoundError({ identifier: WorkflowStatusIdentifier.make("missing") }).message,
        new WorkflowStatusIdentifierAmbiguousError({
          identifier: WorkflowStatusIdentifier.make("Open"),
          matches: [
            { statusId, ofAttribute: attributeId },
            { statusId: otherStatusId, ofAttribute: otherAttributeId }
          ]
        }).message,
        new WorkflowStatusCategoryNotFoundError({ identifier: StatusCategoryIdentifier.make("missing") }).message,
        new WorkflowStatusCategoryIdentifierAmbiguousError({
          identifier: StatusCategoryIdentifier.make("Active"),
          matches: [
            { categoryId, ofAttribute: attributeId },
            { categoryId: otherCategoryId, ofAttribute: otherAttributeId }
          ]
        }).message,
        new WorkflowRelationshipInvalidError({ entityId: statusId, relationship: "category", target: categoryId })
          .message,
        new WorkflowAttributeUnsupportedError({ attributeId, reason: "not a status ref" }).message,
        new WorkflowStatusClassMismatchError({
          statusId,
          currentClassId: ObjectClassName.make("core:class:Status"),
          targetClassId: ObjectClassName.make("custom:class:Status")
        }).message,
        new WorkflowStatusNameConflictError({
          name: StatusName.make("Open"),
          ofAttribute: attributeId,
          existingStatusId: statusId
        }).message,
        new WorkflowStatusCategoryLabelConflictError({
          label: Schema.decodeUnknownSync(WorkflowLabelSchema)("Active"),
          ofAttribute: attributeId,
          existingCategoryId: categoryId
        }).message,
        new WorkflowStatusInUseError({
          statusId,
          references: [
            { kind: "status-category-default", categoryId },
            { kind: "project-type", projectTypeId: ProjectTypeId.make("project-type-1") },
            { kind: "task-type", taskTypeId: TaskTypeId.make("task-type-1") },
            { kind: "task", taskId: DocId.make("task-1") }
          ]
        }).message,
        new WorkflowStatusCategoryInUseError({ categoryId, statusIds: [statusId] }).message
      ]

      expect(messages.every((message) => message.length > 20)).toBe(true)
      expect(messages.join("\n")).toContain("pass an attribute ID")
      expect(messages.join("\n")).toContain("update those relationships")
    })
  )
})
