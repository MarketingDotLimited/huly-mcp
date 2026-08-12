/* eslint-disable @typescript-eslint/consistent-type-assertions -- SDK-branded fixture values and generic HulyClient test seams have no public constructors */
import { describe, it } from "@effect/vitest"
import type {
  AnyAttribute,
  Class,
  Doc,
  DocumentQuery,
  FindResult,
  PersonId,
  Ref,
  Space,
  Status,
  StatusCategory,
  WithLookup
} from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { Asset, IntlString } from "@hcengineering/platform"
import type { ProjectType, Task, TaskType } from "@hcengineering/task"
import { Effect, Result, Schema } from "effect"
import { expect } from "vitest"

import { HulyClient, type HulyClientError, type HulyClientOperations } from "../../../src/huly/client.js"
import {
  HulyAttributeIdentifier,
  Integer,
  NonEmptyString,
  StatusName,
  StatusCategoryIdentifier,
  WorkflowStatusIdentifier
} from "../../../src/domain/schemas/shared.js"
import type { WorkflowStatusIdentifierAmbiguousError } from "../../../src/huly/errors.js"
import { core, task } from "../../../src/huly/huly-plugins.js"
import {
  getStatusCategory,
  getWorkflowStatus,
  listStatusCategories,
  listWorkflowStatuses
} from "../../../src/huly/operations/workflow-statuses.js"
import {
  createStatusCategory,
  deleteStatusCategory,
  updateStatusCategory
} from "../../../src/huly/operations/status-category-writes.js"
import {
  createWorkflowStatus,
  deleteWorkflowStatus,
  updateWorkflowStatus
} from "../../../src/huly/operations/workflow-status-writes.js"
import { WorkflowIconSchema, WorkflowLabelSchema } from "../../../src/domain/schemas/workflow-statuses.js"
import { assertAt } from "../../../src/utils/assertions.js"

const modelSpace = "core:space:Model" as Ref<Space>
const actor = "person:test" as PersonId

const makeAttribute = (
  id: string,
  name: string,
  owner: string,
  supportsStatuses = true,
  statusClass: Ref<Class<Status>> = core.class.Status
): AnyAttribute =>
  ({
    _id: id as Ref<AnyAttribute>,
    _class: core.class.Attribute,
    space: modelSpace,
    modifiedBy: actor,
    modifiedOn: 1,
    attributeOf: owner as Ref<Class<Doc>>,
    name,
    label: `${owner}:${name}` as IntlString,
    type: supportsStatuses
      ? { _class: core.class.RefTo, label: "core:string:Status" as IntlString, to: statusClass }
      : { _class: core.class.TypeString, label: "core:string:Name" as IntlString }
  }) as AnyAttribute

const makeStatus = (id: string, name: string, ofAttribute: Ref<AnyAttribute>, category?: Ref<StatusCategory>): Status =>
  ({
    _id: id as Ref<Status>,
    _class: core.class.Status,
    space: modelSpace,
    modifiedBy: actor,
    modifiedOn: 1,
    ofAttribute,
    name,
    ...(category === undefined ? {} : { category })
  }) as Status

const makeCategory = (
  id: string,
  label: string,
  ofAttribute: Ref<AnyAttribute>,
  defaultStatusName: string
): StatusCategory =>
  ({
    _id: id as Ref<StatusCategory>,
    _class: core.class.StatusCategory,
    space: modelSpace,
    modifiedBy: actor,
    modifiedOn: 1,
    ofAttribute,
    icon: "core:icon:TypeString" as Asset,
    label: label as IntlString,
    color: 4,
    defaultStatusName,
    order: 2
  }) as StatusCategory

interface WorkflowFixture {
  readonly attributes: ReadonlyArray<AnyAttribute>
  readonly statuses: ReadonlyArray<Status>
  readonly categories: ReadonlyArray<StatusCategory>
  readonly projectTypes?: ReadonlyArray<ProjectType>
  readonly taskTypes?: ReadonlyArray<TaskType>
  readonly tasks?: ReadonlyArray<Task>
}

const createWorkflowLayer = (fixture: WorkflowFixture, additional?: Partial<HulyClientOperations>) => {
  const findAll = (<T extends Doc>(classRef: Ref<Class<T>>, query: DocumentQuery<T>): Effect.Effect<FindResult<T>> => {
    const rows: ReadonlyArray<Doc> =
      classRef === core.class.Attribute
        ? fixture.attributes
        : classRef === core.class.Status
          ? fixture.statuses
          : classRef === core.class.StatusCategory
            ? fixture.categories
            : classRef === task.class.ProjectType
              ? (fixture.projectTypes ?? [])
              : classRef === task.class.TaskType
                ? (fixture.taskTypes ?? [])
                : classRef === task.class.Task
                  ? (fixture.tasks ?? [])
                  : []
    const record = query as Record<string, unknown>
    const filtered = rows.filter(
      (row) =>
        (record._id === undefined || row._id === record._id) &&
        (record.ofAttribute === undefined || ("ofAttribute" in row && row.ofAttribute === record.ofAttribute)) &&
        (record.category === undefined || ("category" in row && row.category === record.category))
    )
    return Effect.succeed(toFindResult(filtered as Array<T>))
  }) as HulyClientOperations["findAll"]

  const findOne = (<T extends Doc>(
    classRef: Ref<Class<T>>,
    query: DocumentQuery<T>
  ): Effect.Effect<WithLookup<T> | undefined, HulyClientError> =>
    Effect.map(findAll(classRef, query), (rows) => rows[0])) as HulyClientOperations["findOne"]

  return HulyClient.testLayer({ findAll, findOne, ...additional })
}

const createStatusMutationLayer = (
  fixture: WorkflowFixture,
  capture: {
    attributes?: Record<string, unknown>
    classRef?: string
    space?: string
    id?: string
    updateId?: string
    updateOperations?: Record<string, unknown>
    updates?: Array<{ readonly id: string; readonly operations: Record<string, unknown> }>
    removedId?: string
  }
) => {
  const createDoc: HulyClientOperations["createDoc"] = ((
    classRef: unknown,
    space: unknown,
    attributes: unknown,
    id: unknown
  ) => {
    capture.classRef = String(classRef)
    capture.space = String(space)
    capture.attributes = attributes as Record<string, unknown>
    capture.id = String(id)
    return Effect.succeed(id as Ref<Doc>)
  }) as HulyClientOperations["createDoc"]

  const updateDoc: HulyClientOperations["updateDoc"] = ((
    _class: unknown,
    _space: unknown,
    id: unknown,
    ops: unknown
  ) => {
    capture.updateId = String(id)
    capture.updateOperations = ops as Record<string, unknown>
    capture.updates = [...(capture.updates ?? []), { id: String(id), operations: ops as Record<string, unknown> }]
    return Effect.succeed({})
  }) as HulyClientOperations["updateDoc"]

  const removeDoc: HulyClientOperations["removeDoc"] = ((_class: unknown, _space: unknown, id: unknown) => {
    capture.removedId = String(id)
    return Effect.succeed({})
  }) as HulyClientOperations["removeDoc"]

  return createWorkflowLayer(fixture, { createDoc, removeDoc, updateDoc })
}

const issueAttribute = makeAttribute("tracker:attribute:IssueStatus", "status", "tracker:class:Issue")
const leadAttribute = makeAttribute("lead:attribute:LeadStatus", "status", "lead:class:Lead")
const activeCategory = makeCategory("category-active", "Active", issueAttribute._id, "In Progress")
const fixtures = {
  attributes: [issueAttribute, leadAttribute],
  categories: [activeCategory],
  statuses: [
    makeStatus("status-progress", "In Progress", issueAttribute._id, activeCategory._id),
    makeStatus("status-done", "Done", issueAttribute._id),
    makeStatus("lead-status-progress", "In Progress", leadAttribute._id)
  ]
}

describe("generic workflow status reads", () => {
  it.effect("lists statuses with resolved attribute and category relationships", () =>
    Effect.gen(function* () {
      const result = yield* listWorkflowStatuses({
        ofAttribute: HulyAttributeIdentifier.make(issueAttribute._id)
      }).pipe(Effect.provide(createWorkflowLayer(fixtures)))

      expect(result.total).toBe(2)
      expect(assertAt(result.statuses, 0).ofAttribute).toEqual({
        attributeId: issueAttribute._id,
        name: "status",
        ownerClassId: "tracker:class:Issue"
      })
      expect(assertAt(result.statuses, 0).category).toEqual({ categoryId: "category-active", label: "Active" })
    })
  )

  it.effect("rejects an ambiguous status name unless ofAttribute narrows it", () =>
    Effect.gen(function* () {
      const result = yield* getWorkflowStatus({ status: WorkflowStatusIdentifier.make("In Progress") }).pipe(
        Effect.provide(createWorkflowLayer(fixtures)),
        Effect.result
      )

      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure._tag).toBe(
          "WorkflowStatusIdentifierAmbiguousError" satisfies WorkflowStatusIdentifierAmbiguousError["_tag"]
        )
      }
    })
  )

  it.effect("lists categories with the default status and relationship count", () =>
    Effect.gen(function* () {
      const result = yield* listStatusCategories({
        ofAttribute: HulyAttributeIdentifier.make(issueAttribute._id)
      }).pipe(Effect.provide(createWorkflowLayer(fixtures)))

      expect(result.total).toBe(1)
      expect(assertAt(result.categories, 0).defaultStatus).toEqual({ statusId: "status-progress", name: "In Progress" })
      expect(assertAt(result.categories, 0).statusCount).toBe(1)
    })
  )

  it.effect("supports category filtering, limits, and narrowed get operations", () =>
    Effect.gen(function* () {
      const statuses = yield* listWorkflowStatuses({
        category: StatusCategoryIdentifier.make("Active"),
        limit: 1
      }).pipe(Effect.provide(createWorkflowLayer(fixtures)))
      const status = yield* getWorkflowStatus({
        status: WorkflowStatusIdentifier.make("In Progress"),
        ofAttribute: HulyAttributeIdentifier.make(issueAttribute._id)
      }).pipe(Effect.provide(createWorkflowLayer(fixtures)))
      const category = yield* getStatusCategory({
        category: StatusCategoryIdentifier.make("Active"),
        ofAttribute: HulyAttributeIdentifier.make(issueAttribute._id)
      }).pipe(Effect.provide(createWorkflowLayer(fixtures)))

      expect(statuses.statuses).toHaveLength(1)
      expect(status.statusId).toBe("status-progress")
      expect(category.categoryId).toBe("category-active")
    })
  )

  it.effect("rejects ambiguous attribute names and category labels", () =>
    Effect.gen(function* () {
      const leadCategory = makeCategory("lead-category-active", "Active", leadAttribute._id, "In Progress")
      const localFixtures = { ...fixtures, categories: [...fixtures.categories, leadCategory] }
      const attributeResult = yield* listWorkflowStatuses({ ofAttribute: HulyAttributeIdentifier.make("status") }).pipe(
        Effect.provide(createWorkflowLayer(localFixtures)),
        Effect.result
      )
      const categoryResult = yield* getStatusCategory({ category: StatusCategoryIdentifier.make("Active") }).pipe(
        Effect.provide(createWorkflowLayer(localFixtures)),
        Effect.result
      )

      expect(Result.isFailure(attributeResult) && attributeResult.failure._tag).toBe(
        "WorkflowAttributeIdentifierAmbiguousError"
      )
      expect(Result.isFailure(categoryResult) && categoryResult.failure._tag).toBe(
        "WorkflowStatusCategoryIdentifierAmbiguousError"
      )
    })
  )

  it.effect("rejects missing and broken model relationships", () =>
    Effect.gen(function* () {
      const missingStatus = yield* getWorkflowStatus({ status: WorkflowStatusIdentifier.make("Missing") }).pipe(
        Effect.provide(createWorkflowLayer(fixtures)),
        Effect.result
      )
      const missingCategory = yield* getStatusCategory({ category: StatusCategoryIdentifier.make("Missing") }).pipe(
        Effect.provide(createWorkflowLayer(fixtures)),
        Effect.result
      )
      const brokenAttribute = makeStatus(
        "status-broken-attribute",
        "Broken attribute",
        "missing-attribute" as Ref<AnyAttribute>
      )
      const brokenCategory = makeStatus(
        "status-broken-category",
        "Broken category",
        issueAttribute._id,
        "missing-category" as Ref<StatusCategory>
      )
      const invalidAttribute = yield* getWorkflowStatus({
        status: WorkflowStatusIdentifier.make(brokenAttribute._id)
      }).pipe(
        Effect.provide(createWorkflowLayer({ ...fixtures, statuses: [...fixtures.statuses, brokenAttribute] })),
        Effect.result
      )
      const invalidCategory = yield* getWorkflowStatus({
        status: WorkflowStatusIdentifier.make(brokenCategory._id)
      }).pipe(
        Effect.provide(createWorkflowLayer({ ...fixtures, statuses: [...fixtures.statuses, brokenCategory] })),
        Effect.result
      )
      const invalidDefault = yield* getStatusCategory({
        category: StatusCategoryIdentifier.make("category-invalid-default")
      }).pipe(
        Effect.provide(
          createWorkflowLayer({
            ...fixtures,
            categories: [
              ...fixtures.categories,
              makeCategory("category-invalid-default", "Invalid", issueAttribute._id, "Missing")
            ]
          })
        ),
        Effect.result
      )

      expect(Result.isFailure(missingStatus) && missingStatus.failure._tag).toBe("WorkflowStatusNotFoundError")
      expect(Result.isFailure(missingCategory) && missingCategory.failure._tag).toBe(
        "WorkflowStatusCategoryNotFoundError"
      )
      expect(Result.isFailure(invalidAttribute) && invalidAttribute.failure._tag).toBe(
        "WorkflowRelationshipInvalidError"
      )
      expect(Result.isFailure(invalidCategory) && invalidCategory.failure._tag).toBe("WorkflowRelationshipInvalidError")
      expect(Result.isFailure(invalidDefault) && invalidDefault.failure._tag).toBe("WorkflowRelationshipInvalidError")
    })
  )

  it.effect("preserves status categories shared across attributes", () =>
    Effect.gen(function* () {
      const crossAttribute = makeStatus(
        "lead-status-cross-category",
        "Cross category",
        leadAttribute._id,
        activeCategory._id
      )
      const localFixtures = { ...fixtures, statuses: [...fixtures.statuses, crossAttribute] }
      const statusResult = yield* getWorkflowStatus({ status: WorkflowStatusIdentifier.make(crossAttribute._id) }).pipe(
        Effect.provide(createWorkflowLayer(localFixtures)),
        Effect.result
      )
      const categoryResult = yield* getStatusCategory({
        category: StatusCategoryIdentifier.make(activeCategory._id)
      }).pipe(Effect.provide(createWorkflowLayer(localFixtures)), Effect.result)

      expect(Result.isSuccess(statusResult) && statusResult.success.category?.categoryId).toBe(activeCategory._id)
      expect(Result.isSuccess(categoryResult) && categoryResult.success.statusCount).toBe(2)
    })
  )

  it.effect("resolves attributes by exact label and rejects unknown attribute locators", () =>
    Effect.gen(function* () {
      const byLabel = yield* listWorkflowStatuses({
        ofAttribute: HulyAttributeIdentifier.make(String(issueAttribute.label))
      }).pipe(Effect.provide(createWorkflowLayer(fixtures)))
      const missing = yield* listWorkflowStatuses({
        ofAttribute: HulyAttributeIdentifier.make("missing:attribute")
      }).pipe(Effect.provide(createWorkflowLayer(fixtures)), Effect.result)

      expect(byLabel.total).toBe(2)
      expect(Result.isFailure(missing) && missing.failure._tag).toBe("WorkflowAttributeNotFoundError")
    })
  )
})

describe("generic workflow status writes", () => {
  it.effect("creates a status with its resolved status class and category relationship", () =>
    Effect.gen(function* () {
      const capture: { attributes?: Record<string, unknown>; classRef?: string; space?: string; id?: string } = {}
      const mutationLayer = createStatusMutationLayer(fixtures, capture)
      const result = yield* createWorkflowStatus({
        ofAttribute: HulyAttributeIdentifier.make(issueAttribute._id),
        name: StatusName.make("Ready for QA"),
        category: StatusCategoryIdentifier.make(activeCategory._id),
        color: Integer.make(9),
        description: NonEmptyString.make("Awaiting QA")
      }).pipe(Effect.provide(mutationLayer))

      expect(result.created).toBe(true)
      expect(result.status.name).toBe("Ready for QA")
      expect(result.status.category).toEqual({ categoryId: activeCategory._id, label: "Active" })
      expect(capture.classRef).toBe(core.class.Status)
      expect(capture.space).toBe("core:space:Model")
      expect(capture.attributes).toMatchObject({
        ofAttribute: issueAttribute._id,
        name: "Ready for QA",
        category: activeCategory._id,
        color: 9,
        description: "Awaiting QA"
      })
    })
  )

  it.effect("creates a category whose default status belongs to the same attribute", () =>
    Effect.gen(function* () {
      const capture: { attributes?: Record<string, unknown>; classRef?: string; space?: string; id?: string } = {}
      const mutationLayer = createStatusMutationLayer(fixtures, capture)
      const result = yield* createStatusCategory({
        ofAttribute: HulyAttributeIdentifier.make(issueAttribute._id),
        label: Schema.decodeUnknownSync(WorkflowLabelSchema)("Review"),
        defaultStatus: WorkflowStatusIdentifier.make("Done"),
        icon: Schema.decodeUnknownSync(WorkflowIconSchema)("core:icon:TypeString"),
        color: Integer.make(5),
        order: Integer.make(7)
      }).pipe(Effect.provide(mutationLayer))

      expect(result.created).toBe(true)
      expect(result.category.defaultStatus).toEqual({ statusId: "status-done", name: "Done" })
      expect(result.category.statusCount).toBe(0)
      expect(capture.classRef).toBe(core.class.StatusCategory)
      expect(capture.attributes).toMatchObject({
        ofAttribute: issueAttribute._id,
        label: "Review",
        defaultStatusName: "Done",
        icon: "core:icon:TypeString",
        color: 5,
        order: 7
      })
    })
  )

  it.effect("returns existing statuses and categories idempotently", () =>
    Effect.gen(function* () {
      const status = yield* createWorkflowStatus({
        ofAttribute: HulyAttributeIdentifier.make(issueAttribute._id),
        name: StatusName.make("in progress")
      }).pipe(Effect.provide(createWorkflowLayer(fixtures)))
      const category = yield* createStatusCategory({
        ofAttribute: HulyAttributeIdentifier.make(issueAttribute._id),
        label: Schema.decodeUnknownSync(WorkflowLabelSchema)("active"),
        defaultStatus: WorkflowStatusIdentifier.make("Done")
      }).pipe(Effect.provide(createWorkflowLayer(fixtures)))

      expect(status.created).toBe(false)
      expect(category.created).toBe(false)
    })
  )

  it.effect("defaults category metadata and rejects non-status attributes", () =>
    Effect.gen(function* () {
      const unsupported = makeAttribute("custom:attribute:Text", "text", "custom:class:Thing", false)
      const unsupportedResult = yield* createWorkflowStatus({
        ofAttribute: HulyAttributeIdentifier.make(unsupported._id),
        name: StatusName.make("Invalid")
      }).pipe(
        Effect.provide(
          createWorkflowLayer({ attributes: [...fixtures.attributes, unsupported], categories: [], statuses: [] })
        ),
        Effect.result
      )
      const capture: { attributes?: Record<string, unknown> } = {}
      const category = yield* createStatusCategory({
        ofAttribute: HulyAttributeIdentifier.make(issueAttribute._id),
        label: Schema.decodeUnknownSync(WorkflowLabelSchema)("Defaults"),
        defaultStatus: WorkflowStatusIdentifier.make("Done")
      }).pipe(Effect.provide(createStatusMutationLayer(fixtures, capture)))

      expect(Result.isFailure(unsupportedResult) && unsupportedResult.failure._tag).toBe(
        "WorkflowAttributeUnsupportedError"
      )
      expect(category.category.color).toBe(0)
      expect(category.category.order).toBe(0)
      expect(capture.attributes).toMatchObject({ icon: core.icon.TypeString, color: 0, order: 0 })
    })
  )

  it.effect("creates a status without optional metadata", () =>
    Effect.gen(function* () {
      const capture: { attributes?: Record<string, unknown> } = {}
      const result = yield* createWorkflowStatus({
        ofAttribute: HulyAttributeIdentifier.make(issueAttribute._id),
        name: StatusName.make("Minimal")
      }).pipe(Effect.provide(createStatusMutationLayer({ ...fixtures, statuses: [] }, capture)))

      expect(result.status.category).toBeUndefined()
      expect(result.status.color).toBeUndefined()
      expect(result.status.description).toBeUndefined()
      expect(capture.attributes).toEqual({ ofAttribute: issueAttribute._id, name: "Minimal" })
    })
  )

  it.effect("updates a status and explicitly clears optional relationships", () =>
    Effect.gen(function* () {
      const capture: {
        updateId?: string
        updateOperations?: Record<string, unknown>
        updates?: Array<{ readonly id: string; readonly operations: Record<string, unknown> }>
      } = {}
      const result = yield* updateWorkflowStatus({
        status: WorkflowStatusIdentifier.make("status-progress"),
        category: null,
        color: null,
        description: null
      }).pipe(Effect.provide(createStatusMutationLayer(fixtures, capture)))

      expect(result.status.name).toBe("In Progress")
      expect(result.status.category).toBeUndefined()
      expect(result.status.color).toBeUndefined()
      expect(result.status.description).toBeUndefined()
      expect(capture.updates).toEqual([
        { id: "status-progress", operations: { $unset: { category: "", color: "", description: "" } } }
      ])
    })
  )

  it.effect("rejects renaming a status used as a category default", () =>
    Effect.gen(function* () {
      const result = yield* updateWorkflowStatus({
        status: WorkflowStatusIdentifier.make("status-progress"),
        name: StatusName.make("Reviewing")
      }).pipe(Effect.provide(createWorkflowLayer(fixtures)), Effect.result)

      expect(Result.isFailure(result) && result.failure._tag).toBe("WorkflowStatusInUseError")
    })
  )

  it.effect("updates category metadata while preserving its default status relationship", () =>
    Effect.gen(function* () {
      const capture: { updateId?: string; updateOperations?: Record<string, unknown> } = {}
      const result = yield* updateStatusCategory({
        category: StatusCategoryIdentifier.make(activeCategory._id),
        label: Schema.decodeUnknownSync(WorkflowLabelSchema)("Doing"),
        defaultStatus: WorkflowStatusIdentifier.make("Done"),
        order: Integer.make(8)
      }).pipe(Effect.provide(createStatusMutationLayer(fixtures, capture)))

      expect(result.category.label).toBe("Doing")
      expect(result.category.defaultStatus.statusId).toBe("status-done")
      expect(result.category.statusCount).toBe(1)
      expect(capture.updateOperations).toEqual({ label: "Doing", defaultStatusName: "Done", order: 8 })
    })
  )

  it.effect("preserves omitted status and category fields", () =>
    Effect.gen(function* () {
      const detailedStatus = {
        ...makeStatus("status-detailed", "Detailed", issueAttribute._id, activeCategory._id),
        color: 6,
        description: "Existing description"
      } as Status
      const localFixtures = { ...fixtures, statuses: [...fixtures.statuses, detailedStatus] }
      const statusCapture: { updateOperations?: Record<string, unknown> } = {}
      const categoryCapture: { updateOperations?: Record<string, unknown> } = {}

      const status = yield* updateWorkflowStatus({
        status: WorkflowStatusIdentifier.make(detailedStatus._id),
        currentOfAttribute: HulyAttributeIdentifier.make(issueAttribute._id),
        name: StatusName.make("Detailed renamed")
      }).pipe(Effect.provide(createStatusMutationLayer(localFixtures, statusCapture)))
      const category = yield* updateStatusCategory({
        category: StatusCategoryIdentifier.make(activeCategory._id),
        currentOfAttribute: HulyAttributeIdentifier.make(issueAttribute._id),
        icon: Schema.decodeUnknownSync(WorkflowIconSchema)("core:icon:TypeNumber")
      }).pipe(Effect.provide(createStatusMutationLayer(localFixtures, categoryCapture)))

      expect(status.status).toMatchObject({ name: "Detailed renamed", color: 6, description: "Existing description" })
      expect(statusCapture.updateOperations).toEqual({ name: "Detailed renamed" })
      expect(category.category).toMatchObject({ label: "Active", color: 4, order: 2 })
      expect(categoryCapture.updateOperations).toEqual({ icon: "core:icon:TypeNumber" })
    })
  )

  it.effect("sets optional status metadata and rejects name/category conflicts", () =>
    Effect.gen(function* () {
      const capture: { updateOperations?: Record<string, unknown> } = {}
      const updated = yield* updateWorkflowStatus({
        status: WorkflowStatusIdentifier.make("status-done"),
        category: StatusCategoryIdentifier.make(activeCategory._id),
        color: [Integer.make(2), Integer.make(3)],
        description: NonEmptyString.make("Finished")
      }).pipe(Effect.provide(createStatusMutationLayer(fixtures, capture)))
      const conflict = yield* updateWorkflowStatus({
        status: WorkflowStatusIdentifier.make("status-done"),
        name: StatusName.make("In Progress")
      }).pipe(Effect.provide(createWorkflowLayer(fixtures)), Effect.result)
      const categorized = makeStatus("status-categorized", "Categorized", issueAttribute._id, activeCategory._id)
      const sharedCategoryMove = yield* updateWorkflowStatus({
        status: WorkflowStatusIdentifier.make(categorized._id),
        ofAttribute: HulyAttributeIdentifier.make(leadAttribute._id)
      }).pipe(
        Effect.provide(createStatusMutationLayer({ ...fixtures, statuses: [...fixtures.statuses, categorized] }, {}))
      )

      expect(updated.status.category?.categoryId).toBe(activeCategory._id)
      expect(updated.status.color).toEqual([2, 3])
      expect(capture.updateOperations).toMatchObject({
        category: activeCategory._id,
        color: [2, 3],
        description: "Finished"
      })
      expect(Result.isFailure(conflict) && conflict.failure._tag).toBe("WorkflowStatusNameConflictError")
      expect(sharedCategoryMove.status.ofAttribute.attributeId).toBe(leadAttribute._id)
      expect(sharedCategoryMove.status.category?.categoryId).toBe(activeCategory._id)
    })
  )

  it.effect("preserves shared status references on category moves and rejects duplicate labels", () =>
    Effect.gen(function* () {
      const movedSharedCategory = yield* updateStatusCategory({
        category: StatusCategoryIdentifier.make(activeCategory._id),
        ofAttribute: HulyAttributeIdentifier.make(leadAttribute._id)
      }).pipe(Effect.provide(createStatusMutationLayer(fixtures, {})))
      const duplicate = makeCategory("category-duplicate", "Duplicate", issueAttribute._id, "Done")
      const labelConflict = yield* updateStatusCategory({
        category: StatusCategoryIdentifier.make(activeCategory._id),
        label: Schema.decodeUnknownSync(WorkflowLabelSchema)("Duplicate")
      }).pipe(
        Effect.provide(createWorkflowLayer({ ...fixtures, categories: [...fixtures.categories, duplicate] })),
        Effect.result
      )

      const unused = makeCategory("category-safe-move", "Safe", issueAttribute._id, "Done")
      const capture: { updateOperations?: Record<string, unknown> } = {}
      const moved = yield* updateStatusCategory({
        category: StatusCategoryIdentifier.make(unused._id),
        ofAttribute: HulyAttributeIdentifier.make(leadAttribute._id),
        label: Schema.decodeUnknownSync(WorkflowLabelSchema)("Lead Safe"),
        defaultStatus: WorkflowStatusIdentifier.make("lead-status-progress"),
        icon: Schema.decodeUnknownSync(WorkflowIconSchema)("core:icon:TypeNumber"),
        color: [Integer.make(7), Integer.make(8)],
        order: Integer.make(9)
      }).pipe(
        Effect.provide(
          createStatusMutationLayer({ ...fixtures, categories: [...fixtures.categories, unused] }, capture)
        )
      )

      expect(movedSharedCategory.category.ofAttribute.attributeId).toBe(leadAttribute._id)
      expect(movedSharedCategory.category.statusCount).toBe(1)
      expect(Result.isFailure(labelConflict) && labelConflict.failure._tag).toBe(
        "WorkflowStatusCategoryLabelConflictError"
      )
      expect(moved.category.ofAttribute.attributeId).toBe(leadAttribute._id)
      expect(capture.updateOperations).toEqual({
        label: "Lead Safe",
        ofAttribute: leadAttribute._id,
        defaultStatusName: "In Progress",
        icon: "core:icon:TypeNumber",
        color: [7, 8],
        order: 9
      })
    })
  )

  it.effect("rejects deleting a category while statuses reference it", () =>
    Effect.gen(function* () {
      const result = yield* deleteStatusCategory({ category: StatusCategoryIdentifier.make(activeCategory._id) }).pipe(
        Effect.provide(createWorkflowLayer(fixtures)),
        Effect.result
      )

      expect(Result.isFailure(result) && result.failure._tag).toBe("WorkflowStatusCategoryInUseError")
    })
  )

  it.effect("rejects deleting a status used as a category default", () =>
    Effect.gen(function* () {
      const result = yield* deleteWorkflowStatus({ status: WorkflowStatusIdentifier.make("status-progress") }).pipe(
        Effect.provide(createWorkflowLayer(fixtures)),
        Effect.result
      )

      expect(Result.isFailure(result) && result.failure._tag).toBe("WorkflowStatusInUseError")
    })
  )

  it.effect("rejects deleting statuses referenced by tracker workflow and task records", () =>
    Effect.gen(function* () {
      const unusedStatus = makeStatus("status-tracker-reference", "Tracker reference", issueAttribute._id)
      const projectType = {
        _id: "project-type-reference",
        statuses: [{ _id: unusedStatus._id, taskType: "task-type-reference" }]
      } as ProjectType
      const taskType = { _id: "task-type-reference", statuses: [unusedStatus._id] } as TaskType
      const taskRow = { _id: "task-reference", status: unusedStatus._id } as Task
      const result = yield* deleteWorkflowStatus({ status: WorkflowStatusIdentifier.make(unusedStatus._id) }).pipe(
        Effect.provide(
          createWorkflowLayer({
            ...fixtures,
            statuses: [...fixtures.statuses, unusedStatus],
            projectTypes: [projectType],
            taskTypes: [taskType],
            tasks: [taskRow]
          })
        ),
        Effect.result
      )

      expect(Result.isFailure(result) && result.failure._tag).toBe("WorkflowStatusInUseError")
      if (Result.isFailure(result) && result.failure._tag === "WorkflowStatusInUseError") {
        expect(result.failure.references.map((reference) => reference.kind)).toEqual([
          "project-type",
          "task-type",
          "task"
        ])
      }
    })
  )

  it.effect("rejects moving a status to an attribute backed by another status class", () =>
    Effect.gen(function* () {
      const alternateStatusClass = "custom:class:LeadStatus" as Ref<Class<Status>>
      const alternateAttribute = makeAttribute(
        "custom:attribute:LeadStatus",
        "leadStatus",
        "custom:class:Lead",
        true,
        alternateStatusClass
      )
      const movable = makeStatus("status-movable", "Movable", issueAttribute._id)
      const result = yield* updateWorkflowStatus({
        status: WorkflowStatusIdentifier.make(movable._id),
        ofAttribute: HulyAttributeIdentifier.make(alternateAttribute._id)
      }).pipe(
        Effect.provide(
          createWorkflowLayer({
            attributes: [...fixtures.attributes, alternateAttribute],
            categories: fixtures.categories,
            statuses: [...fixtures.statuses, movable]
          })
        ),
        Effect.result
      )

      expect(Result.isFailure(result) && result.failure._tag).toBe("WorkflowStatusClassMismatchError")
    })
  )

  it.effect("deletes unreferenced statuses and categories", () =>
    Effect.gen(function* () {
      const unusedStatus = makeStatus("status-unused", "Unused", issueAttribute._id)
      const unusedCategory = makeCategory("category-unused", "Unused category", issueAttribute._id, "Done")
      const localFixtures = {
        ...fixtures,
        categories: [...fixtures.categories, unusedCategory],
        statuses: [...fixtures.statuses, unusedStatus]
      }
      const statusCapture: { removedId?: string } = {}
      const categoryCapture: { removedId?: string } = {}

      const deletedStatus = yield* deleteWorkflowStatus({
        status: WorkflowStatusIdentifier.make(unusedStatus._id),
        ofAttribute: HulyAttributeIdentifier.make(issueAttribute._id)
      }).pipe(Effect.provide(createStatusMutationLayer(localFixtures, statusCapture)))
      const deletedCategory = yield* deleteStatusCategory({
        category: StatusCategoryIdentifier.make(unusedCategory._id),
        ofAttribute: HulyAttributeIdentifier.make(issueAttribute._id)
      }).pipe(Effect.provide(createStatusMutationLayer(localFixtures, categoryCapture)))

      expect(deletedStatus).toEqual({ statusId: unusedStatus._id, deleted: true })
      expect(statusCapture.removedId).toBe(unusedStatus._id)
      expect(deletedCategory).toEqual({ categoryId: unusedCategory._id, deleted: true })
      expect(categoryCapture.removedId).toBe(unusedCategory._id)
    })
  )
})
