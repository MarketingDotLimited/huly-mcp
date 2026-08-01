import type { AnyAttribute, Class, Data, DocumentUpdate, Ref, Status, StatusCategory } from "@hcengineering/core"
import { generateId } from "@hcengineering/core"
import { Effect, Option, Schema } from "effect"

import {
  HulyAttributeId,
  HulyAttributeIdentifier,
  ObjectClassName,
  StatusCategoryId,
  StatusCategoryIdentifier,
  StatusName,
  WorkflowStatusIdentifier,
  WorkflowStatusId
} from "../../domain/schemas/shared.js"
import type {
  CreateWorkflowStatusResult,
  DeleteWorkflowStatusResult,
  UpdateWorkflowStatusResult
} from "../../domain/schemas/workflow-status-results.js"
import type {
  CreateWorkflowStatusParams,
  DeleteWorkflowStatusParams,
  UpdateWorkflowStatusParams,
  WorkflowColor
} from "../../domain/schemas/workflow-statuses.js"
import { HulyClient, type HulyClientError, type HulyClientOperations } from "../client.js"
import {
  WorkflowAttributeUnsupportedError,
  WorkflowStatusClassMismatchError,
  type WorkflowStatusIdentifierAmbiguousError,
  WorkflowStatusInUseError,
  WorkflowStatusNameConflictError
} from "../errors-workflow-statuses.js"
import { core } from "../huly-plugins.js"
import {
  loadWorkflowModel,
  resolveStatusCategory,
  resolveWorkflowAttribute,
  resolveWorkflowStatus,
  type WorkflowProjectionError,
  type WorkflowResolverError,
  workflowStatusSummary
} from "./workflow-statuses-shared.js"
import { loadWorkflowStatusReferences } from "./workflow-status-usage.js"

type WorkflowCreateError =
  | HulyClientError
  | WorkflowAttributeUnsupportedError
  | WorkflowProjectionError
  | WorkflowResolverError

type WorkflowWriteError =
  | WorkflowCreateError
  | WorkflowStatusClassMismatchError
  | WorkflowStatusInUseError
  | WorkflowStatusNameConflictError

const StatusClassRefSchema = Schema.declare(
  (input): input is Ref<Class<Status>> => typeof input === "string" && input.length > 0
)
const StatusAttributeTypeSchema = Schema.Struct({ to: StatusClassRefSchema })

const resolveStatusClass = (
  attribute: AnyAttribute
): Effect.Effect<Ref<Class<Status>>, WorkflowAttributeUnsupportedError> => {
  const decoded = Schema.decodeUnknownOption(StatusAttributeTypeSchema)(attribute.type)
  return Option.isSome(decoded)
    ? Effect.succeed(decoded.value.to)
    : Effect.fail(
        new WorkflowAttributeUnsupportedError({
          attributeId: HulyAttributeId.make(attribute._id),
          reason: "its type metadata does not reference a Status class"
        })
      )
}

const sdkColor = (color: WorkflowColor): number | Array<number> =>
  typeof color === "number" ? color : Array.from(color)

const findExistingStatus = (
  model: Parameters<typeof resolveWorkflowStatus>[0],
  name: StatusName,
  attribute: AnyAttribute
): Effect.Effect<Status | undefined, WorkflowStatusIdentifierAmbiguousError> =>
  resolveWorkflowStatus(model, WorkflowStatusIdentifier.make(name), attribute).pipe(
    Effect.catchTag("WorkflowStatusNotFoundError", () => Effect.succeed(undefined))
  )

const statusData = (
  params: CreateWorkflowStatusParams,
  attribute: AnyAttribute,
  category: StatusCategory | undefined
): Data<Status> => ({
  ofAttribute: attribute._id,
  name: params.name,
  ...(category === undefined ? {} : { category: category._id }),
  ...(params.color === undefined ? {} : { color: sdkColor(params.color) }),
  ...(params.description === undefined ? {} : { description: params.description })
})

const createdStatusResult = (
  params: CreateWorkflowStatusParams,
  statusId: Ref<Status>,
  attribute: AnyAttribute,
  category: StatusCategory | undefined
): CreateWorkflowStatusResult => ({
  status: {
    statusId: WorkflowStatusId.make(statusId),
    name: params.name,
    ofAttribute: {
      attributeId: HulyAttributeId.make(attribute._id),
      name: attribute.name,
      ownerClassId: ObjectClassName.make(String(attribute.attributeOf))
    },
    ...(category === undefined
      ? {}
      : { category: { categoryId: StatusCategoryId.make(category._id), label: category.label } }),
    ...(params.color === undefined ? {} : { color: params.color }),
    ...(params.description === undefined ? {} : { description: params.description })
  },
  created: true
})

export const createWorkflowStatus = (
  params: CreateWorkflowStatusParams
): Effect.Effect<CreateWorkflowStatusResult, WorkflowCreateError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const model = yield* loadWorkflowModel(client)
    const attribute = yield* resolveWorkflowAttribute(model, params.ofAttribute)
    const existing = yield* findExistingStatus(model, params.name, attribute)
    if (existing !== undefined) {
      return { status: yield* workflowStatusSummary(model, existing), created: false }
    }

    const statusClass = yield* resolveStatusClass(attribute)
    const category =
      params.category === undefined ? undefined : yield* resolveStatusCategory(model, params.category, undefined)
    const statusId = generateId<Status>()
    yield* client.createDoc(statusClass, core.space.Model, statusData(params, attribute, category), statusId)
    return createdStatusResult(params, statusId, attribute, category)
  })

const normalized = (value: string): string => value.toLocaleLowerCase()

const statusNameConflict = (
  model: Parameters<typeof resolveWorkflowStatus>[0],
  status: Status,
  attribute: AnyAttribute,
  name: StatusName
): WorkflowStatusNameConflictError | undefined => {
  const existing = model.statuses.find(
    (candidate) =>
      candidate._id !== status._id &&
      candidate.ofAttribute === attribute._id &&
      normalized(candidate.name) === normalized(name)
  )
  return existing === undefined
    ? undefined
    : new WorkflowStatusNameConflictError({
        name,
        ofAttribute: HulyAttributeId.make(attribute._id),
        existingStatusId: WorkflowStatusId.make(existing._id)
      })
}

const categoryForUpdate = (
  model: Parameters<typeof resolveStatusCategory>[0],
  status: Status,
  category: UpdateWorkflowStatusParams["category"]
): Effect.Effect<StatusCategory | undefined, WorkflowResolverError> =>
  Effect.gen(function* () {
    if (category === null) return undefined
    if (category !== undefined) return yield* resolveStatusCategory(model, category, undefined)
    if (status.category === undefined) return undefined
    return yield* resolveStatusCategory(model, StatusCategoryIdentifier.make(status.category), undefined)
  })

const updatedColor = (params: UpdateWorkflowStatusParams, status: Status): Status["color"] =>
  params.color === undefined ? status.color : params.color === null ? undefined : sdkColor(params.color)

const updatedDescription = (params: UpdateWorkflowStatusParams, status: Status): Status["description"] =>
  params.description === undefined ? status.description : (params.description ?? undefined)

const statusUnset = (params: UpdateWorkflowStatusParams): NonNullable<DocumentUpdate<Status>["$unset"]> => ({
  ...(params.category === null ? { category: "" } : {}),
  ...(params.color === null ? { color: "" } : {}),
  ...(params.description === null ? { description: "" } : {})
})

const statusIdentityUpdates = (
  params: UpdateWorkflowStatusParams,
  attribute: AnyAttribute
): DocumentUpdate<Status> => ({
  ...(params.name === undefined ? {} : { name: params.name }),
  ...(params.ofAttribute === undefined ? {} : { ofAttribute: attribute._id })
})

const statusCategoryUpdate = (
  params: UpdateWorkflowStatusParams,
  category: StatusCategory | undefined
): DocumentUpdate<Status> =>
  params.category === undefined || params.category === null || category === undefined ? {} : { category: category._id }

const statusMetadataUpdates = (
  params: UpdateWorkflowStatusParams,
  color: Status["color"],
  description: Status["description"]
): DocumentUpdate<Status> => ({
  ...(params.color === undefined || params.color === null || color === undefined ? {} : { color }),
  ...(params.description === undefined || params.description === null || description === undefined
    ? {}
    : { description })
})

const statusUpdateOperations = (
  params: UpdateWorkflowStatusParams,
  attribute: AnyAttribute,
  category: StatusCategory | undefined,
  color: Status["color"],
  description: Status["description"]
): DocumentUpdate<Status> => {
  const direct = {
    ...statusIdentityUpdates(params, attribute),
    ...statusCategoryUpdate(params, category),
    ...statusMetadataUpdates(params, color, description)
  }
  const unset = statusUnset(params)
  return Object.keys(unset).length === 0 ? direct : { ...direct, $unset: unset }
}

const defaultCategoriesForStatus = (
  categories: ReadonlyArray<StatusCategory>,
  status: Status
): ReadonlyArray<StatusCategory> =>
  categories.filter(
    (category) =>
      category.ofAttribute === status.ofAttribute && normalized(category.defaultStatusName) === normalized(status.name)
  )

const ensureCompatibleStatusClass = (
  status: Status,
  attribute: AnyAttribute
): Effect.Effect<void, WorkflowAttributeUnsupportedError | WorkflowStatusClassMismatchError> =>
  Effect.gen(function* () {
    const targetClass = yield* resolveStatusClass(attribute)
    if (targetClass !== status._class) {
      return yield* new WorkflowStatusClassMismatchError({
        statusId: WorkflowStatusId.make(status._id),
        currentClassId: ObjectClassName.make(String(status._class)),
        targetClassId: ObjectClassName.make(String(targetClass))
      })
    }
  })

const ensureStatusMoveIsSafe = (
  client: HulyClientOperations,
  model: Parameters<typeof resolveWorkflowStatus>[0],
  status: Status,
  attribute: AnyAttribute
): Effect.Effect<
  void,
  HulyClientError | WorkflowAttributeUnsupportedError | WorkflowStatusClassMismatchError | WorkflowStatusInUseError
> =>
  status.ofAttribute === attribute._id
    ? Effect.void
    : Effect.gen(function* () {
        yield* ensureCompatibleStatusClass(status, attribute)
        const references = yield* loadWorkflowStatusReferences(client, model.categories, status)
        if (references.length > 0) {
          return yield* new WorkflowStatusInUseError({ statusId: WorkflowStatusId.make(status._id), references })
        }
      })

const applyStatusUpdate = (
  status: Status,
  name: StatusName,
  attribute: AnyAttribute,
  category: StatusCategory | undefined,
  color: Status["color"],
  description: Status["description"]
): Status => {
  const { category: _category, color: _color, description: _description, ...required } = status
  return {
    ...required,
    name,
    ofAttribute: attribute._id,
    ...(category === undefined ? {} : { category: category._id }),
    ...(color === undefined ? {} : { color }),
    ...(description === undefined ? {} : { description })
  }
}

export const updateWorkflowStatus = (
  params: UpdateWorkflowStatusParams
): Effect.Effect<UpdateWorkflowStatusResult, WorkflowWriteError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const model = yield* loadWorkflowModel(client)
    const currentAttribute = yield* params.currentOfAttribute === undefined
      ? Effect.succeed(undefined)
      : resolveWorkflowAttribute(model, params.currentOfAttribute)
    const status = yield* resolveWorkflowStatus(model, params.status, currentAttribute)
    const attribute = yield* params.ofAttribute === undefined
      ? resolveWorkflowAttribute(model, HulyAttributeIdentifier.make(status.ofAttribute))
      : resolveWorkflowAttribute(model, params.ofAttribute)
    yield* ensureStatusMoveIsSafe(client, model, status, attribute)
    const category = yield* categoryForUpdate(model, status, params.category)
    const name = params.name ?? StatusName.make(status.name)
    const conflict = statusNameConflict(model, status, attribute, name)
    if (conflict !== undefined) return yield* conflict
    const defaultCategories = defaultCategoriesForStatus(model.categories, status)
    if (name !== status.name && defaultCategories.length > 0) {
      return yield* new WorkflowStatusInUseError({
        statusId: WorkflowStatusId.make(status._id),
        references: defaultCategories.map((category) => ({
          kind: "status-category-default",
          categoryId: StatusCategoryId.make(category._id)
        }))
      })
    }

    const color = updatedColor(params, status)
    const description = updatedDescription(params, status)
    const operations = statusUpdateOperations(params, attribute, category, color, description)
    yield* client.updateDoc(status._class, status.space, status._id, operations)
    const updatedStatus = applyStatusUpdate(status, name, attribute, category, color, description)
    const updatedModel = {
      ...model,
      statuses: model.statuses.map((row) => (row._id === status._id ? updatedStatus : row))
    }
    return { status: yield* workflowStatusSummary(updatedModel, updatedStatus), updated: true }
  })

export const deleteWorkflowStatus = (
  params: DeleteWorkflowStatusParams
): Effect.Effect<DeleteWorkflowStatusResult, WorkflowWriteError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const model = yield* loadWorkflowModel(client)
    const attribute = yield* params.ofAttribute === undefined
      ? Effect.succeed(undefined)
      : resolveWorkflowAttribute(model, params.ofAttribute)
    const status = yield* resolveWorkflowStatus(model, params.status, attribute)
    const references = yield* loadWorkflowStatusReferences(client, model.categories, status)
    if (references.length > 0) {
      return yield* new WorkflowStatusInUseError({ statusId: WorkflowStatusId.make(status._id), references })
    }
    yield* client.removeDoc(status._class, status.space, status._id)
    return { statusId: WorkflowStatusId.make(status._id), deleted: true }
  })
