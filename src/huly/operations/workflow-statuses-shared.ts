import type { AnyAttribute, Status, StatusCategory } from "@hcengineering/core"
import { Effect } from "effect"

import {
  Count,
  HulyAttributeId,
  type HulyAttributeIdentifier,
  Integer,
  NonEmptyString,
  ObjectClassName,
  StatusCategoryId,
  type StatusCategoryIdentifier,
  StatusName,
  type WorkflowStatusIdentifier,
  WorkflowStatusId
} from "../../domain/schemas/shared.js"
import type {
  GenericStatusCategorySummary,
  WorkflowAttributeSummary,
  WorkflowStatusSummary
} from "../../domain/schemas/workflow-status-results.js"
import type { WorkflowColor } from "../../domain/schemas/workflow-statuses.js"
import type { HulyClientError, HulyClientOperations } from "../client.js"
import {
  WorkflowAttributeIdentifierAmbiguousError,
  WorkflowAttributeNotFoundError,
  WorkflowRelationshipInvalidError,
  WorkflowStatusCategoryIdentifierAmbiguousError,
  WorkflowStatusCategoryNotFoundError,
  WorkflowStatusIdentifierAmbiguousError,
  WorkflowStatusNotFoundError
} from "../errors-workflow-statuses.js"
import { core } from "../huly-plugins.js"
import { isSingle } from "../../utils/assertions.js"
import { hulyQuery } from "./query-helpers.js"

export interface WorkflowModel {
  readonly attributes: ReadonlyArray<AnyAttribute>
  readonly statuses: ReadonlyArray<Status>
  readonly categories: ReadonlyArray<StatusCategory>
}

export type WorkflowResolverError =
  | HulyClientError
  | WorkflowAttributeIdentifierAmbiguousError
  | WorkflowAttributeNotFoundError
  | WorkflowStatusCategoryIdentifierAmbiguousError
  | WorkflowStatusCategoryNotFoundError
  | WorkflowStatusIdentifierAmbiguousError
  | WorkflowStatusNotFoundError

export type WorkflowProjectionError = WorkflowRelationshipInvalidError

const normalized = (value: string): string => value.toLocaleLowerCase()

const workflowColor = (color: number | Array<number>): WorkflowColor =>
  Array.isArray(color) ? color.map((value) => Integer.make(value)) : Integer.make(color)

export const loadWorkflowModel = (client: HulyClientOperations): Effect.Effect<WorkflowModel, HulyClientError> =>
  Effect.all({
    attributes: client.findAll<AnyAttribute>(core.class.Attribute, hulyQuery<AnyAttribute>({})),
    statuses: client.findAll<Status>(core.class.Status, hulyQuery<Status>({})),
    categories: client.findAll<StatusCategory>(core.class.StatusCategory, hulyQuery<StatusCategory>({}))
  })

const attributeMatches = (
  attributes: ReadonlyArray<AnyAttribute>,
  identifier: HulyAttributeIdentifier
): ReadonlyArray<AnyAttribute> => {
  const locator = String(identifier)
  const byId = attributes.filter((attribute) => attribute._id === locator)
  return byId.length > 0
    ? byId
    : attributes.filter(
        (attribute) => normalized(attribute.name) === normalized(locator) || attribute.label === locator
      )
}

export const resolveWorkflowAttribute = (
  model: WorkflowModel,
  identifier: HulyAttributeIdentifier
): Effect.Effect<AnyAttribute, WorkflowAttributeIdentifierAmbiguousError | WorkflowAttributeNotFoundError> => {
  const matches = attributeMatches(model.attributes, identifier)
  if (isSingle(matches)) return Effect.succeed(matches[0])
  if (matches.length === 0) return Effect.fail(new WorkflowAttributeNotFoundError({ identifier }))
  return Effect.fail(
    new WorkflowAttributeIdentifierAmbiguousError({
      identifier,
      matches: matches.map((match) => ({
        attributeId: HulyAttributeId.make(match._id),
        ownerClassId: ObjectClassName.make(String(match.attributeOf))
      }))
    })
  )
}

export const optionallyResolveWorkflowAttribute = (
  model: WorkflowModel,
  identifier: HulyAttributeIdentifier | undefined
): Effect.Effect<
  AnyAttribute | undefined,
  WorkflowAttributeIdentifierAmbiguousError | WorkflowAttributeNotFoundError
> => (identifier === undefined ? Effect.succeed(undefined) : resolveWorkflowAttribute(model, identifier))

const statusCandidates = (
  model: WorkflowModel,
  identifier: WorkflowStatusIdentifier,
  attribute: AnyAttribute | undefined
): ReadonlyArray<Status> => {
  const locator = String(identifier)
  const scoped =
    attribute === undefined ? model.statuses : model.statuses.filter((status) => status.ofAttribute === attribute._id)
  const byId = scoped.filter((status) => status._id === locator)
  return byId.length > 0 ? byId : scoped.filter((status) => normalized(status.name) === normalized(locator))
}

export const resolveWorkflowStatus = (
  model: WorkflowModel,
  identifier: WorkflowStatusIdentifier,
  attribute: AnyAttribute | undefined
): Effect.Effect<Status, WorkflowStatusIdentifierAmbiguousError | WorkflowStatusNotFoundError> => {
  const matches = statusCandidates(model, identifier, attribute)
  if (isSingle(matches)) return Effect.succeed(matches[0])
  if (matches.length === 0) return Effect.fail(new WorkflowStatusNotFoundError({ identifier }))
  return Effect.fail(
    new WorkflowStatusIdentifierAmbiguousError({
      identifier,
      matches: matches.map((match) => ({
        statusId: WorkflowStatusId.make(match._id),
        ofAttribute: HulyAttributeId.make(match.ofAttribute)
      }))
    })
  )
}

const categoryCandidates = (
  model: WorkflowModel,
  identifier: StatusCategoryIdentifier,
  attribute: AnyAttribute | undefined
): ReadonlyArray<StatusCategory> => {
  const locator = String(identifier)
  const scoped =
    attribute === undefined
      ? model.categories
      : model.categories.filter((category) => category.ofAttribute === attribute._id)
  const byId = scoped.filter((category) => category._id === locator)
  return byId.length > 0 ? byId : scoped.filter((category) => normalized(category.label) === normalized(locator))
}

export const resolveStatusCategory = (
  model: WorkflowModel,
  identifier: StatusCategoryIdentifier,
  attribute: AnyAttribute | undefined
): Effect.Effect<
  StatusCategory,
  WorkflowStatusCategoryIdentifierAmbiguousError | WorkflowStatusCategoryNotFoundError
> => {
  const matches = categoryCandidates(model, identifier, attribute)
  if (isSingle(matches)) return Effect.succeed(matches[0])
  if (matches.length === 0) return Effect.fail(new WorkflowStatusCategoryNotFoundError({ identifier }))
  return Effect.fail(
    new WorkflowStatusCategoryIdentifierAmbiguousError({
      identifier,
      matches: matches.map((match) => ({
        categoryId: StatusCategoryId.make(match._id),
        ofAttribute: HulyAttributeId.make(match.ofAttribute)
      }))
    })
  )
}

const attributeSummary = (
  model: WorkflowModel,
  entityId: string,
  attributeId: AnyAttribute["_id"]
): Effect.Effect<WorkflowAttributeSummary, WorkflowProjectionError> => {
  const attribute = model.attributes.find((candidate) => candidate._id === attributeId)
  return attribute === undefined
    ? Effect.fail(
        new WorkflowRelationshipInvalidError({ entityId, relationship: "attribute", target: String(attributeId) })
      )
    : Effect.succeed({
        attributeId: HulyAttributeId.make(attribute._id),
        name: attribute.name,
        ownerClassId: ObjectClassName.make(String(attribute.attributeOf))
      })
}

const statusCategoryRelationship = (
  model: WorkflowModel,
  status: Status
): Effect.Effect<StatusCategory | undefined, WorkflowProjectionError> => {
  if (status.category === undefined) return Effect.succeed(undefined)
  const category = model.categories.find((candidate) => candidate._id === status.category)
  if (category === undefined) {
    return Effect.fail(
      new WorkflowRelationshipInvalidError({
        entityId: String(status._id),
        relationship: "category",
        target: String(status.category)
      })
    )
  }
  return Effect.succeed(category)
}

export const workflowStatusSummary = (
  model: WorkflowModel,
  status: Status
): Effect.Effect<WorkflowStatusSummary, WorkflowProjectionError> =>
  Effect.gen(function* () {
    const ofAttribute = yield* attributeSummary(model, String(status._id), status.ofAttribute)
    const category = yield* statusCategoryRelationship(model, status)
    const summary = {
      statusId: WorkflowStatusId.make(status._id),
      name: StatusName.make(status.name),
      ofAttribute,
      ...(category === undefined
        ? {}
        : { category: { categoryId: StatusCategoryId.make(category._id), label: category.label } }),
      ...(status.color === undefined ? {} : { color: workflowColor(status.color) }),
      ...(status.description === undefined || status.description === ""
        ? {}
        : { description: NonEmptyString.make(status.description) })
    } satisfies WorkflowStatusSummary
    return summary
  })

export const statusCategorySummary = (
  model: WorkflowModel,
  category: StatusCategory
): Effect.Effect<GenericStatusCategorySummary, WorkflowProjectionError> =>
  Effect.gen(function* () {
    const ofAttribute = yield* attributeSummary(model, String(category._id), category.ofAttribute)
    const statuses = model.statuses.filter((status) => status.category === category._id)
    const defaultStatus = model.statuses.find(
      (status) =>
        status.ofAttribute === category.ofAttribute &&
        normalized(status.name) === normalized(category.defaultStatusName)
    )
    const summary = {
      categoryId: StatusCategoryId.make(category._id),
      label: category.label,
      ofAttribute,
      icon: category.icon,
      color: workflowColor(category.color),
      ...(defaultStatus === undefined
        ? {}
        : {
            defaultStatus: {
              statusId: WorkflowStatusId.make(defaultStatus._id),
              name: StatusName.make(defaultStatus.name)
            }
          }),
      order: Integer.make(category.order),
      statusCount: Count.make(statuses.length)
    } satisfies GenericStatusCategorySummary
    return summary
  })
