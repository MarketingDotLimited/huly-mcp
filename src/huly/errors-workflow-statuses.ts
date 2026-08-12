import { Schema } from "effect"

import {
  DocId,
  HulyAttributeId,
  HulyAttributeIdentifier,
  NonEmptyString,
  ObjectClassName,
  ProjectTypeId,
  StatusCategoryId,
  StatusCategoryIdentifier,
  StatusName,
  TaskTypeId,
  WorkflowStatusId,
  WorkflowStatusIdentifier
} from "../domain/schemas/shared.js"
import { WorkflowLabelSchema } from "../domain/schemas/workflow-statuses.js"

const MINIMUM_AMBIGUOUS_MATCHES = 2

const AmbiguousAttributeMatchSchema = Schema.Struct({ attributeId: HulyAttributeId, ownerClassId: ObjectClassName })

const AmbiguousStatusMatchSchema = Schema.Struct({ statusId: WorkflowStatusId, ofAttribute: HulyAttributeId })

const AmbiguousCategoryMatchSchema = Schema.Struct({ categoryId: StatusCategoryId, ofAttribute: HulyAttributeId })

export class WorkflowAttributeNotFoundError extends Schema.TaggedError<WorkflowAttributeNotFoundError>()(
  "WorkflowAttributeNotFoundError",
  { identifier: HulyAttributeIdentifier }
) {
  override get message(): string {
    return `Workflow attribute '${this.identifier}' not found; pass an attribute ID from list_huly_attributes`
  }
}

export class WorkflowAttributeIdentifierAmbiguousError extends Schema.TaggedError<WorkflowAttributeIdentifierAmbiguousError>()(
  "WorkflowAttributeIdentifierAmbiguousError",
  {
    identifier: HulyAttributeIdentifier,
    matches: Schema.Array(AmbiguousAttributeMatchSchema).check(Schema.isMinLength(MINIMUM_AMBIGUOUS_MATCHES))
  }
) {
  override get message(): string {
    const matches = this.matches.map((match) => `${match.attributeId} (${match.ownerClassId})`).join(", ")
    return `Workflow attribute '${this.identifier}' is ambiguous; pass an attribute ID. Matches: ${matches}`
  }
}

export class WorkflowStatusNotFoundError extends Schema.TaggedError<WorkflowStatusNotFoundError>()(
  "WorkflowStatusNotFoundError",
  { identifier: WorkflowStatusIdentifier }
) {
  override get message(): string {
    return `Workflow status '${this.identifier}' not found`
  }
}

export class WorkflowStatusIdentifierAmbiguousError extends Schema.TaggedError<WorkflowStatusIdentifierAmbiguousError>()(
  "WorkflowStatusIdentifierAmbiguousError",
  {
    identifier: WorkflowStatusIdentifier,
    matches: Schema.Array(AmbiguousStatusMatchSchema).check(Schema.isMinLength(MINIMUM_AMBIGUOUS_MATCHES))
  }
) {
  override get message(): string {
    const matches = this.matches.map((match) => `${match.statusId} (${match.ofAttribute})`).join(", ")
    return `Workflow status '${this.identifier}' is ambiguous; pass a status ID or ofAttribute. Matches: ${matches}`
  }
}

export class WorkflowStatusCategoryNotFoundError extends Schema.TaggedError<WorkflowStatusCategoryNotFoundError>()(
  "WorkflowStatusCategoryNotFoundError",
  { identifier: StatusCategoryIdentifier }
) {
  override get message(): string {
    return `Workflow status category '${this.identifier}' not found`
  }
}

export class WorkflowStatusCategoryIdentifierAmbiguousError extends Schema.TaggedError<WorkflowStatusCategoryIdentifierAmbiguousError>()(
  "WorkflowStatusCategoryIdentifierAmbiguousError",
  {
    identifier: StatusCategoryIdentifier,
    matches: Schema.Array(AmbiguousCategoryMatchSchema).check(Schema.isMinLength(MINIMUM_AMBIGUOUS_MATCHES))
  }
) {
  override get message(): string {
    const matches = this.matches.map((match) => `${match.categoryId} (${match.ofAttribute})`).join(", ")
    return `Workflow status category '${this.identifier}' is ambiguous; pass a category ID or ofAttribute. Matches: ${matches}`
  }
}

export class WorkflowRelationshipInvalidError extends Schema.TaggedError<WorkflowRelationshipInvalidError>()(
  "WorkflowRelationshipInvalidError",
  { entityId: NonEmptyString, relationship: NonEmptyString, target: NonEmptyString }
) {
  override get message(): string {
    return `Workflow model relationship is invalid: '${this.entityId}' references missing ${this.relationship} '${this.target}'`
  }
}

export class WorkflowAttributeUnsupportedError extends Schema.TaggedError<WorkflowAttributeUnsupportedError>()(
  "WorkflowAttributeUnsupportedError",
  { attributeId: HulyAttributeId, reason: NonEmptyString }
) {
  override get message(): string {
    return `Attribute '${this.attributeId}' cannot own generic workflow statuses: ${this.reason}`
  }
}

export class WorkflowStatusClassMismatchError extends Schema.TaggedError<WorkflowStatusClassMismatchError>()(
  "WorkflowStatusClassMismatchError",
  { statusId: WorkflowStatusId, currentClassId: ObjectClassName, targetClassId: ObjectClassName }
) {
  override get message(): string {
    return `Workflow status '${this.statusId}' cannot move between attributes backed by different status classes ('${this.currentClassId}' to '${this.targetClassId}')`
  }
}

export class WorkflowStatusNameConflictError extends Schema.TaggedError<WorkflowStatusNameConflictError>()(
  "WorkflowStatusNameConflictError",
  { name: StatusName, ofAttribute: HulyAttributeId, existingStatusId: WorkflowStatusId }
) {
  override get message(): string {
    return `Workflow status name '${this.name}' already exists for attribute '${this.ofAttribute}' (${this.existingStatusId})`
  }
}

export class WorkflowStatusCategoryLabelConflictError extends Schema.TaggedError<WorkflowStatusCategoryLabelConflictError>()(
  "WorkflowStatusCategoryLabelConflictError",
  { label: WorkflowLabelSchema, ofAttribute: HulyAttributeId, existingCategoryId: StatusCategoryId }
) {
  override get message(): string {
    return `Workflow status category label '${this.label}' already exists for attribute '${this.ofAttribute}' (${this.existingCategoryId})`
  }
}

export const WorkflowStatusReferenceSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("status-category-default"), categoryId: StatusCategoryId }),
  Schema.Struct({ kind: Schema.Literal("project-type"), projectTypeId: ProjectTypeId }),
  Schema.Struct({ kind: Schema.Literal("task-type"), taskTypeId: TaskTypeId }),
  Schema.Struct({ kind: Schema.Literal("task"), taskId: DocId })
])
export type WorkflowStatusReference = Schema.Schema.Type<typeof WorkflowStatusReferenceSchema>

const workflowReferenceDescription = (reference: WorkflowStatusReference): string => {
  switch (reference.kind) {
    case "status-category-default":
      return `status category ${reference.categoryId}`
    case "project-type":
      return `project type ${reference.projectTypeId}`
    case "task-type":
      return `task type ${reference.taskTypeId}`
    case "task":
      return `task ${reference.taskId}`
  }
}

export class WorkflowStatusInUseError extends Schema.TaggedError<WorkflowStatusInUseError>()(
  "WorkflowStatusInUseError",
  { statusId: WorkflowStatusId, references: Schema.Array(WorkflowStatusReferenceSchema).check(Schema.isNonEmpty()) }
) {
  override get message(): string {
    const references = this.references.map(workflowReferenceDescription).join(", ")
    return `Workflow status '${this.statusId}' is still referenced by ${references}; update those relationships before renaming, moving, or deleting it. Use tracker-specific workflow tools for tracker project/task-type references.`
  }
}

export class WorkflowStatusCategoryInUseError extends Schema.TaggedError<WorkflowStatusCategoryInUseError>()(
  "WorkflowStatusCategoryInUseError",
  { categoryId: StatusCategoryId, statusIds: Schema.Array(WorkflowStatusId).check(Schema.isNonEmpty()) }
) {
  override get message(): string {
    return `Workflow status category '${this.categoryId}' is referenced by statuses ${this.statusIds.join(", ")}; move or clear those relationships before deleting it`
  }
}

export const WorkflowStatusDomainError = Schema.Union([
  WorkflowAttributeNotFoundError,
  WorkflowAttributeIdentifierAmbiguousError,
  WorkflowStatusNotFoundError,
  WorkflowStatusIdentifierAmbiguousError,
  WorkflowStatusCategoryNotFoundError,
  WorkflowStatusCategoryIdentifierAmbiguousError,
  WorkflowRelationshipInvalidError,
  WorkflowAttributeUnsupportedError,
  WorkflowStatusClassMismatchError,
  WorkflowStatusNameConflictError,
  WorkflowStatusCategoryLabelConflictError,
  WorkflowStatusInUseError,
  WorkflowStatusCategoryInUseError
])
