import {
  CreateStatusCategoryResultSchema,
  CreateWorkflowStatusResultSchema,
  DeleteStatusCategoryResultSchema,
  DeleteWorkflowStatusResultSchema,
  ListStatusCategoriesResultSchema,
  ListWorkflowStatusesResultSchema,
  GenericStatusCategorySummarySchema,
  UpdateStatusCategoryResultSchema,
  UpdateWorkflowStatusResultSchema,
  WorkflowStatusSummarySchema
} from "../../domain/schemas/workflow-status-results.js"
import {
  createStatusCategoryParamsJsonSchema,
  createWorkflowStatusParamsJsonSchema,
  deleteStatusCategoryParamsJsonSchema,
  deleteWorkflowStatusParamsJsonSchema,
  getStatusCategoryParamsJsonSchema,
  getWorkflowStatusParamsJsonSchema,
  listStatusCategoriesParamsJsonSchema,
  listWorkflowStatusesParamsJsonSchema,
  parseCreateStatusCategoryParams,
  parseCreateWorkflowStatusParams,
  parseDeleteStatusCategoryParams,
  parseDeleteWorkflowStatusParams,
  parseGetStatusCategoryParams,
  parseGetWorkflowStatusParams,
  parseListStatusCategoriesParams,
  parseListWorkflowStatusesParams,
  parseUpdateStatusCategoryParams,
  parseUpdateWorkflowStatusParams,
  updateStatusCategoryParamsJsonSchema,
  updateWorkflowStatusParamsJsonSchema
} from "../../domain/schemas/workflow-statuses.js"
import {
  createStatusCategory,
  deleteStatusCategory,
  updateStatusCategory
} from "../../huly/operations/status-category-writes.js"
import {
  createWorkflowStatus,
  deleteWorkflowStatus,
  updateWorkflowStatus
} from "../../huly/operations/workflow-status-writes.js"
import {
  getStatusCategory,
  getWorkflowStatus,
  listStatusCategories,
  listWorkflowStatuses
} from "../../huly/operations/workflow-statuses.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "workflow-statuses" as const

export const workflowStatusTools = [
  defineTool(
    {
      name: "list_workflow_statuses",
      description:
        "List generic Huly workflow Status records across the workspace model. Filter by status attribute ID/exact name and category ID/exact label. Returns resolved attribute and category relationships. For one tracker project's issue statuses, use list_statuses instead.",
      category: CATEGORY,
      inputSchema: listWorkflowStatusesParamsJsonSchema,
      resultSchema: ListWorkflowStatusesResultSchema
    },
    parseListWorkflowStatusesParams,
    listWorkflowStatuses
  ),
  defineTool(
    {
      name: "get_workflow_status",
      description:
        "Get one generic Huly workflow Status by ID or exact case-insensitive name. Pass ofAttribute when a name exists for multiple status attributes; ambiguous names are rejected with matching IDs.",
      category: CATEGORY,
      inputSchema: getWorkflowStatusParamsJsonSchema,
      resultSchema: WorkflowStatusSummarySchema
    },
    parseGetWorkflowStatusParams,
    getWorkflowStatus
  ),
  defineTool(
    {
      name: "create_workflow_status",
      description:
        "Create a generic Huly workflow Status for an attribute resolved by ID or exact name. Optionally resolve a shared category by ID or exact label; pass a category ID when its label is ambiguous. Idempotently returns the existing normalized name in that attribute with created=false. Tracker project-type wiring remains owned by create_issue_status.",
      category: CATEGORY,
      inputSchema: createWorkflowStatusParamsJsonSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      resultSchema: CreateWorkflowStatusResultSchema
    },
    parseCreateWorkflowStatusParams,
    createWorkflowStatus
  ),
  defineTool(
    {
      name: "update_workflow_status",
      description:
        "Update a generic workflow Status by ID or exact name. Use currentOfAttribute to disambiguate the target. category, color, and description accept null to clear. Renaming is refused while a StatusCategory uses the status as its default; update that default first. Moving attributes is allowed only when the status is unreferenced and both attributes use the same concrete Status class. Categories may be shared across attributes.",
      category: CATEGORY,
      inputSchema: updateWorkflowStatusParamsJsonSchema,
      resultSchema: UpdateWorkflowStatusResultSchema
    },
    parseUpdateWorkflowStatusParams,
    updateWorkflowStatus
  ),
  defineTool(
    {
      name: "delete_workflow_status",
      description:
        "Permanently delete an unreferenced generic workflow Status by ID or exact name. Refuses deletion while any StatusCategory default, ProjectType, TaskType, or task record references it. This tool never rewrites tracker workflow arrays; use tracker-specific workflow tools to remove those references first.",
      category: CATEGORY,
      inputSchema: deleteWorkflowStatusParamsJsonSchema,
      resultSchema: DeleteWorkflowStatusResultSchema
    },
    parseDeleteWorkflowStatusParams,
    deleteWorkflowStatus
  ),
  defineTool(
    {
      name: "list_status_categories",
      description:
        "List generic Huly StatusCategory records, optionally filtered by status attribute ID or exact name. Returns each category's resolved attribute, default status when unambiguous, and number of statuses that reference it.",
      category: CATEGORY,
      inputSchema: listStatusCategoriesParamsJsonSchema,
      resultSchema: ListStatusCategoriesResultSchema
    },
    parseListStatusCategoriesParams,
    listStatusCategories
  ),
  defineTool(
    {
      name: "get_status_category",
      description:
        "Get one generic Huly StatusCategory by ID or exact case-insensitive label. Pass ofAttribute when a label exists for multiple status attributes; ambiguous labels are rejected with matching IDs. Shared categories may omit defaultStatus when no single status ID is unambiguous.",
      category: CATEGORY,
      inputSchema: getStatusCategoryParamsJsonSchema,
      resultSchema: GenericStatusCategorySummarySchema
    },
    parseGetStatusCategoryParams,
    getStatusCategory
  ),
  defineTool(
    {
      name: "create_status_category",
      description:
        "Create a generic Huly StatusCategory for an attribute resolved by ID or exact name. defaultStatus is resolved within the same attribute, preserving the category/default relationship. Idempotently returns an existing normalized label with created=false.",
      category: CATEGORY,
      inputSchema: createStatusCategoryParamsJsonSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      resultSchema: CreateStatusCategoryResultSchema
    },
    parseCreateStatusCategoryParams,
    createStatusCategory
  ),
  defineTool(
    {
      name: "update_status_category",
      description:
        "Update a generic StatusCategory by ID or exact label. The resulting default status must belong to the resulting attribute. Statuses from other attributes may continue to reference the category because Huly categories can be shared.",
      category: CATEGORY,
      inputSchema: updateStatusCategoryParamsJsonSchema,
      resultSchema: UpdateStatusCategoryResultSchema
    },
    parseUpdateStatusCategoryParams,
    updateStatusCategory
  ),
  defineTool(
    {
      name: "delete_status_category",
      description:
        "Permanently delete an unreferenced generic StatusCategory by ID or exact label. Refuses deletion while any Status references the category, preventing dangling relationships.",
      category: CATEGORY,
      inputSchema: deleteStatusCategoryParamsJsonSchema,
      resultSchema: DeleteStatusCategoryResultSchema
    },
    parseDeleteStatusCategoryParams,
    deleteStatusCategory
  )
] as const satisfies ReadonlyArray<RegisteredTool>
