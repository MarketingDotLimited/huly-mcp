import type { AnyAttribute, Data, DocumentUpdate, Status, StatusCategory } from "@hcengineering/core"
import { generateId } from "@hcengineering/core"
import { Effect } from "effect"

import {
  Count,
  HulyAttributeId,
  HulyAttributeIdentifier,
  Integer,
  ObjectClassName,
  StatusCategoryId,
  StatusCategoryIdentifier,
  StatusName,
  WorkflowStatusIdentifier,
  WorkflowStatusId
} from "../../domain/schemas/shared.js"
import type {
  CreateStatusCategoryResult,
  DeleteStatusCategoryResult,
  UpdateStatusCategoryResult
} from "../../domain/schemas/workflow-status-results.js"
import type {
  CreateStatusCategoryParams,
  DeleteStatusCategoryParams,
  UpdateStatusCategoryParams,
  WorkflowColor,
  WorkflowLabel
} from "../../domain/schemas/workflow-statuses.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  type WorkflowStatusCategoryIdentifierAmbiguousError,
  WorkflowStatusCategoryInUseError,
  WorkflowStatusCategoryLabelConflictError
} from "../errors-workflow-statuses.js"
import { core } from "../huly-plugins.js"
import {
  loadWorkflowModel,
  resolveStatusCategory,
  resolveWorkflowAttribute,
  resolveWorkflowStatus,
  statusCategorySummary,
  type WorkflowProjectionError,
  type WorkflowResolverError
} from "./workflow-statuses-shared.js"

type StatusCategoryCreateError =
  | HulyClientError
  | WorkflowProjectionError
  | WorkflowResolverError
  | WorkflowStatusCategoryIdentifierAmbiguousError

type StatusCategoryWriteError =
  | StatusCategoryCreateError
  | WorkflowStatusCategoryInUseError
  | WorkflowStatusCategoryLabelConflictError

const DEFAULT_STATUS_CATEGORY_COLOR = Integer.make(0)
const DEFAULT_STATUS_CATEGORY_ORDER = Integer.make(0)

const sdkColor = (color: WorkflowColor): number | Array<number> =>
  typeof color === "number" ? color : Array.from(color)

const findExistingCategory = (
  model: Parameters<typeof resolveStatusCategory>[0],
  label: StatusCategoryIdentifier,
  attribute: Parameters<typeof resolveStatusCategory>[2]
): Effect.Effect<StatusCategory | undefined, WorkflowStatusCategoryIdentifierAmbiguousError> =>
  resolveStatusCategory(model, label, attribute).pipe(
    Effect.catchTag("WorkflowStatusCategoryNotFoundError", () => Effect.succeed(undefined))
  )

export const createStatusCategory = (
  params: CreateStatusCategoryParams
): Effect.Effect<CreateStatusCategoryResult, StatusCategoryCreateError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const model = yield* loadWorkflowModel(client)
    const attribute = yield* resolveWorkflowAttribute(model, params.ofAttribute)
    const existing = yield* findExistingCategory(model, StatusCategoryIdentifier.make(params.label), attribute)
    if (existing !== undefined) {
      return { category: yield* statusCategorySummary(model, existing), created: false }
    }

    const defaultStatus = yield* resolveWorkflowStatus(model, params.defaultStatus, attribute)
    const categoryId = generateId<StatusCategory>()
    const icon = params.icon ?? core.icon.TypeString
    const color = params.color ?? DEFAULT_STATUS_CATEGORY_COLOR
    const order = params.order ?? DEFAULT_STATUS_CATEGORY_ORDER
    const attributes: Data<StatusCategory> = {
      ofAttribute: attribute._id,
      label: params.label,
      defaultStatusName: defaultStatus.name,
      icon,
      color: sdkColor(color),
      order
    }
    yield* client.createDoc(core.class.StatusCategory, core.space.Model, attributes, categoryId)

    return {
      category: {
        categoryId: StatusCategoryId.make(categoryId),
        label: params.label,
        ofAttribute: {
          attributeId: HulyAttributeId.make(attribute._id),
          name: attribute.name,
          ownerClassId: ObjectClassName.make(String(attribute.attributeOf))
        },
        icon,
        color,
        defaultStatus: {
          statusId: WorkflowStatusId.make(defaultStatus._id),
          name: StatusName.make(defaultStatus.name)
        },
        order,
        statusCount: Count.make(0)
      },
      created: true
    }
  })

const normalized = (value: string): string => value.toLocaleLowerCase()

const ensureUniqueCategoryLabel = (
  model: Parameters<typeof resolveStatusCategory>[0],
  category: StatusCategory,
  attribute: AnyAttribute,
  label: WorkflowLabel
): Effect.Effect<void, WorkflowStatusCategoryLabelConflictError> => {
  const conflict = model.categories.find(
    (candidate) =>
      candidate._id !== category._id &&
      candidate.ofAttribute === attribute._id &&
      normalized(candidate.label) === normalized(label)
  )
  return conflict === undefined
    ? Effect.void
    : Effect.fail(
        new WorkflowStatusCategoryLabelConflictError({
          label,
          ofAttribute: HulyAttributeId.make(attribute._id),
          existingCategoryId: StatusCategoryId.make(conflict._id)
        })
      )
}

const applyCategoryUpdate = (
  params: UpdateStatusCategoryParams,
  category: StatusCategory,
  attribute: AnyAttribute,
  defaultStatus: Status,
  label: StatusCategory["label"],
  color: StatusCategory["color"]
): StatusCategory => ({
  ...category,
  ofAttribute: attribute._id,
  label,
  defaultStatusName: defaultStatus.name,
  icon: params.icon ?? category.icon,
  color,
  order: params.order ?? category.order
})

const categoryUpdateOperations = (
  params: UpdateStatusCategoryParams,
  attribute: AnyAttribute,
  defaultStatus: Status,
  label: StatusCategory["label"],
  color: StatusCategory["color"]
): DocumentUpdate<StatusCategory> => ({
  ...(params.label === undefined ? {} : { label }),
  ...(params.ofAttribute === undefined ? {} : { ofAttribute: attribute._id }),
  ...(params.defaultStatus === undefined ? {} : { defaultStatusName: defaultStatus.name }),
  ...(params.icon === undefined ? {} : { icon: params.icon }),
  ...(params.color === undefined ? {} : { color }),
  ...(params.order === undefined ? {} : { order: params.order })
})

export const updateStatusCategory = (
  params: UpdateStatusCategoryParams
): Effect.Effect<UpdateStatusCategoryResult, StatusCategoryWriteError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const model = yield* loadWorkflowModel(client)
    const currentAttribute = yield* params.currentOfAttribute === undefined
      ? Effect.succeed(undefined)
      : resolveWorkflowAttribute(model, params.currentOfAttribute)
    const category = yield* resolveStatusCategory(model, params.category, currentAttribute)
    const attribute = yield* params.ofAttribute === undefined
      ? resolveWorkflowAttribute(model, HulyAttributeIdentifier.make(category.ofAttribute))
      : resolveWorkflowAttribute(model, params.ofAttribute)
    const label = params.label ?? category.label
    yield* ensureUniqueCategoryLabel(model, category, attribute, label)
    const defaultStatus = yield* resolveWorkflowStatus(
      model,
      params.defaultStatus ?? WorkflowStatusIdentifier.make(category.defaultStatusName),
      attribute
    )
    const color = params.color === undefined ? category.color : sdkColor(params.color)
    const updatedCategory = applyCategoryUpdate(params, category, attribute, defaultStatus, label, color)
    const operations = categoryUpdateOperations(params, attribute, defaultStatus, label, color)
    yield* client.updateDoc(category._class, category.space, category._id, operations)
    const updatedModel = {
      ...model,
      categories: model.categories.map((row) => (row._id === category._id ? updatedCategory : row))
    }
    return { category: yield* statusCategorySummary(updatedModel, updatedCategory), updated: true }
  })

export const deleteStatusCategory = (
  params: DeleteStatusCategoryParams
): Effect.Effect<DeleteStatusCategoryResult, StatusCategoryWriteError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const model = yield* loadWorkflowModel(client)
    const attribute = yield* params.ofAttribute === undefined
      ? Effect.succeed(undefined)
      : resolveWorkflowAttribute(model, params.ofAttribute)
    const category = yield* resolveStatusCategory(model, params.category, attribute)
    const statuses = model.statuses.filter((status) => status.category === category._id)
    if (statuses.length > 0) {
      return yield* new WorkflowStatusCategoryInUseError({
        categoryId: StatusCategoryId.make(category._id),
        statusIds: statuses.map((status) => WorkflowStatusId.make(status._id))
      })
    }
    yield* client.removeDoc(category._class, category.space, category._id)
    return { categoryId: StatusCategoryId.make(category._id), deleted: true }
  })
