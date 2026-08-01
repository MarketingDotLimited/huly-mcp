import { Schema } from "effect"

import {
  Count,
  HulyAttributeId,
  Integer,
  ListTotal,
  NonEmptyString,
  ObjectClassName,
  StatusCategoryId,
  StatusName,
  WorkflowStatusId
} from "./shared.js"
import { WorkflowColorSchema, WorkflowIconSchema, WorkflowLabelSchema } from "./workflow-statuses.js"

export const WorkflowAttributeSummarySchema = Schema.Struct({
  attributeId: HulyAttributeId,
  name: NonEmptyString,
  ownerClassId: ObjectClassName
})
export type WorkflowAttributeSummary = Schema.Schema.Type<typeof WorkflowAttributeSummarySchema>

export const WorkflowStatusCategoryRefSchema = Schema.Struct({
  categoryId: StatusCategoryId,
  label: WorkflowLabelSchema
})
export type WorkflowStatusCategoryRef = Schema.Schema.Type<typeof WorkflowStatusCategoryRefSchema>

export const WorkflowStatusRefSchema = Schema.Struct({ statusId: WorkflowStatusId, name: StatusName })
export type WorkflowStatusRef = Schema.Schema.Type<typeof WorkflowStatusRefSchema>

export const WorkflowStatusSummarySchema = Schema.Struct({
  statusId: WorkflowStatusId,
  name: StatusName,
  ofAttribute: WorkflowAttributeSummarySchema,
  category: Schema.optional(WorkflowStatusCategoryRefSchema),
  color: Schema.optional(WorkflowColorSchema),
  description: Schema.optional(NonEmptyString)
})
export type WorkflowStatusSummary = Schema.Schema.Type<typeof WorkflowStatusSummarySchema>

export const GenericStatusCategorySummarySchema = Schema.Struct({
  categoryId: StatusCategoryId,
  label: WorkflowLabelSchema,
  ofAttribute: WorkflowAttributeSummarySchema,
  icon: WorkflowIconSchema,
  color: WorkflowColorSchema,
  defaultStatus: WorkflowStatusRefSchema,
  order: Integer,
  statusCount: Count
})
export type GenericStatusCategorySummary = Schema.Schema.Type<typeof GenericStatusCategorySummarySchema>

export const ListWorkflowStatusesResultSchema = Schema.Struct({
  statuses: Schema.Array(WorkflowStatusSummarySchema),
  total: ListTotal
})
export type ListWorkflowStatusesResult = Schema.Schema.Type<typeof ListWorkflowStatusesResultSchema>

export const ListStatusCategoriesResultSchema = Schema.Struct({
  categories: Schema.Array(GenericStatusCategorySummarySchema),
  total: ListTotal
})
export type ListStatusCategoriesResult = Schema.Schema.Type<typeof ListStatusCategoriesResultSchema>

export const CreateWorkflowStatusResultSchema = Schema.Struct({
  status: WorkflowStatusSummarySchema,
  created: Schema.Boolean
})
export type CreateWorkflowStatusResult = Schema.Schema.Type<typeof CreateWorkflowStatusResultSchema>

export const UpdateWorkflowStatusResultSchema = Schema.Struct({
  status: WorkflowStatusSummarySchema,
  updated: Schema.Literal(true)
})
export type UpdateWorkflowStatusResult = Schema.Schema.Type<typeof UpdateWorkflowStatusResultSchema>

export const DeleteWorkflowStatusResultSchema = Schema.Struct({
  statusId: WorkflowStatusId,
  deleted: Schema.Literal(true)
})
export type DeleteWorkflowStatusResult = Schema.Schema.Type<typeof DeleteWorkflowStatusResultSchema>

export const CreateStatusCategoryResultSchema = Schema.Struct({
  category: GenericStatusCategorySummarySchema,
  created: Schema.Boolean
})
export type CreateStatusCategoryResult = Schema.Schema.Type<typeof CreateStatusCategoryResultSchema>

export const UpdateStatusCategoryResultSchema = Schema.Struct({
  category: GenericStatusCategorySummarySchema,
  updated: Schema.Literal(true)
})
export type UpdateStatusCategoryResult = Schema.Schema.Type<typeof UpdateStatusCategoryResultSchema>

export const DeleteStatusCategoryResultSchema = Schema.Struct({
  categoryId: StatusCategoryId,
  deleted: Schema.Literal(true)
})
export type DeleteStatusCategoryResult = Schema.Schema.Type<typeof DeleteStatusCategoryResultSchema>
