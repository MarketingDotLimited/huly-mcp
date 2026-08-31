import { Effect, Result } from "effect"

import { Count } from "../../domain/schemas/shared.js"
import { StatusMetadataUnresolvedWarningCode } from "../../domain/schemas/tool-warnings.js"
import type {
  ListStatusCategoriesResult,
  ListWorkflowStatusesResult,
  GenericStatusCategorySummary,
  WorkflowStatusSummary
} from "../../domain/schemas/workflow-status-results.js"
import type {
  GetStatusCategoryParams,
  GetWorkflowStatusParams,
  ListStatusCategoriesParams,
  ListWorkflowStatusesParams
} from "../../domain/schemas/workflow-statuses.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import { clampLimit } from "./query-helpers.js"
import {
  loadWorkflowModel,
  optionallyResolveWorkflowAttribute,
  resolveStatusCategory,
  resolveWorkflowStatus,
  statusCategorySummary,
  type WorkflowProjectionError,
  type WorkflowResolverError,
  workflowStatusSummary
} from "./workflow-statuses-shared.js"

type WorkflowReadError = HulyClientError | WorkflowProjectionError | WorkflowResolverError

export const listWorkflowStatuses = (
  params: ListWorkflowStatusesParams
): Effect.Effect<ListWorkflowStatusesResult, WorkflowReadError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const model = yield* loadWorkflowModel(client)
    const attribute = yield* optionallyResolveWorkflowAttribute(model, params.ofAttribute)
    const category =
      params.category === undefined ? undefined : yield* resolveStatusCategory(model, params.category, attribute)
    const matching = model.statuses
      .filter((status) => attribute === undefined || status.ofAttribute === attribute._id)
      .filter((status) => category === undefined || status.category === category._id)
      .slice(0, clampLimit(params.limit))
    const statuses = yield* Effect.all(matching.map((status) => workflowStatusSummary(model, status)))
    return { statuses, total: Count.make(statuses.length) }
  })

export const getWorkflowStatus = (
  params: GetWorkflowStatusParams
): Effect.Effect<WorkflowStatusSummary, WorkflowReadError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const model = yield* loadWorkflowModel(client)
    const attribute = yield* optionallyResolveWorkflowAttribute(model, params.ofAttribute)
    const status = yield* resolveWorkflowStatus(model, params.status, attribute)
    return yield* workflowStatusSummary(model, status)
  })

export const listStatusCategories = (
  params: ListStatusCategoriesParams
): Effect.Effect<ListStatusCategoriesResult, HulyClientError | WorkflowResolverError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const diagnostics = yield* Diagnostics
    const model = yield* loadWorkflowModel(client)
    const attribute = yield* optionallyResolveWorkflowAttribute(model, params.ofAttribute)
    const matching = model.categories
      .filter((category) => attribute === undefined || category.ofAttribute === attribute._id)
      .slice(0, clampLimit(params.limit))
    const categories: Array<GenericStatusCategorySummary> = []
    for (const category of matching) {
      const summary = yield* statusCategorySummary(model, category).pipe(Effect.result)
      if (Result.isSuccess(summary)) {
        categories.push(summary.success)
        continue
      }
      yield* diagnostics.warnAgent({
        code: StatusMetadataUnresolvedWarningCode,
        message: `Skipped status category '${category.label}' (${category._id}) because its ${summary.failure.relationship} '${summary.failure.target}' could not be resolved.`
      })
    }
    return { categories, total: Count.make(categories.length) }
  })

export const getStatusCategory = (
  params: GetStatusCategoryParams
): Effect.Effect<GenericStatusCategorySummary, WorkflowReadError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const model = yield* loadWorkflowModel(client)
    const attribute = yield* optionallyResolveWorkflowAttribute(model, params.ofAttribute)
    const category = yield* resolveStatusCategory(model, params.category, attribute)
    return yield* statusCategorySummary(model, category)
  })
