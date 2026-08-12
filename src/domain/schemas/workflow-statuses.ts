import type { Asset, IntlString } from "@hcengineering/platform"
import { Schema } from "effect"

import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  HulyAttributeIdentifier,
  Integer,
  LimitParam,
  NonEmptyString,
  StatusName,
  StatusCategoryIdentifier,
  withAtLeastOneRequired,
  WorkflowStatusIdentifier
} from "./shared.js"
import { toDraft07JsonSchema } from "./json-schema.js"

const SdkAssetSchema = Schema.declare((input): input is Asset => typeof input === "string")
const SdkIntlStringSchema = Schema.declare((input): input is IntlString => typeof input === "string")

export const WorkflowIconSchema = NonEmptyString.pipe(Schema.decodeTo(SdkAssetSchema)).annotate({
  identifier: "WorkflowIcon",
  title: "WorkflowIcon",
  description: "Exact Huly asset identifier for a status-category icon.",
  jsonSchema: { type: "string", minLength: 1 }
})
export type WorkflowIcon = Schema.Schema.Type<typeof WorkflowIconSchema>

export const WorkflowLabelSchema = NonEmptyString.pipe(Schema.decodeTo(SdkIntlStringSchema)).annotate({
  identifier: "WorkflowLabel",
  title: "WorkflowLabel",
  description: "Status-category label text or Huly internationalized-string identifier.",
  jsonSchema: { type: "string", minLength: 1 }
})
export type WorkflowLabel = Schema.Schema.Type<typeof WorkflowLabelSchema>

export const WorkflowColorSchema = Schema.Union([Integer, Schema.Array(Integer).check(Schema.isNonEmpty())]).annotate({
  identifier: "WorkflowColor",
  title: "WorkflowColor",
  description: "Huly numeric color token or non-empty numeric gradient token array."
})
export type WorkflowColor = Schema.Schema.Type<typeof WorkflowColorSchema>

const OptionalAttributeLocator = Schema.optional(
  HulyAttributeIdentifier.annotate({
    description:
      "Status attribute ID or exact attribute name. Use this to filter results and disambiguate names shared across attributes."
  })
)

export const ListWorkflowStatusesParamsSchema = Schema.Struct({
  ofAttribute: OptionalAttributeLocator,
  category: Schema.optional(
    StatusCategoryIdentifier.annotate({ description: "Category ID or exact label to filter by." })
  ),
  limit: Schema.optional(LimitParam.annotate({ description: "Maximum statuses to return (default: 50)." }))
}).annotate({ title: "ListWorkflowStatusesParams" })
export type ListWorkflowStatusesParams = Schema.Schema.Type<typeof ListWorkflowStatusesParamsSchema>

export const GetWorkflowStatusParamsSchema = Schema.Struct({
  status: WorkflowStatusIdentifier.annotate({ description: "Status ID or exact case-insensitive name." }),
  ofAttribute: OptionalAttributeLocator
}).annotate({ title: "GetWorkflowStatusParams" })
export type GetWorkflowStatusParams = Schema.Schema.Type<typeof GetWorkflowStatusParamsSchema>

export const CreateWorkflowStatusParamsSchema = Schema.Struct({
  ofAttribute: HulyAttributeIdentifier.annotate({ description: "Status attribute ID or exact attribute name." }),
  name: StatusName.annotate({ description: "Workflow status display name." }),
  category: Schema.optional(
    StatusCategoryIdentifier.annotate({
      description:
        "Category ID or exact label. Categories may be shared across status attributes; pass an ID when a label is ambiguous."
    })
  ),
  color: Schema.optional(WorkflowColorSchema),
  description: Schema.optional(NonEmptyString)
}).annotate({ title: "CreateWorkflowStatusParams" })
export type CreateWorkflowStatusParams = Schema.Schema.Type<typeof CreateWorkflowStatusParamsSchema>

export const UPDATE_WORKFLOW_STATUS_FIELDS = [
  "name",
  "ofAttribute",
  "category",
  "color",
  "description"
] as const satisfies ReadonlyArray<"name" | "ofAttribute" | "category" | "color" | "description">

export const UpdateWorkflowStatusParamsSchema = Schema.Struct({
  status: WorkflowStatusIdentifier.annotate({ description: "Status ID or exact case-insensitive name." }),
  currentOfAttribute: OptionalAttributeLocator,
  name: Schema.optional(StatusName.annotate({ description: "New display name." })),
  ofAttribute: Schema.optional(
    HulyAttributeIdentifier.annotate({
      description:
        "New owning attribute. Moves are rejected while the status is referenced or when the target attribute requires a different concrete Status class."
    })
  ),
  category: Schema.optional(
    Schema.NullOr(StatusCategoryIdentifier).annotate({
      description:
        "New category ID or exact label; pass null to remove the relationship. Categories may be shared across status attributes."
    })
  ),
  color: Schema.optional(
    Schema.NullOr(WorkflowColorSchema).annotate({ description: "New color; pass null to clear it." })
  ),
  description: Schema.optional(
    Schema.NullOr(NonEmptyString).annotate({ description: "New description; pass null to clear it." })
  )
})
  .check(
    Schema.makeFilter((params) =>
      UPDATE_WORKFLOW_STATUS_FIELDS.some((field) => params[field] !== undefined)
        ? undefined
        : atLeastOneUpdateFieldMessage(UPDATE_WORKFLOW_STATUS_FIELDS)
    )
  )
  .annotate({ title: "UpdateWorkflowStatusParams" })
export type UpdateWorkflowStatusParams = Schema.Schema.Type<typeof UpdateWorkflowStatusParamsSchema>
assertUpdateFields<UpdateWorkflowStatusParams>()(["status", "currentOfAttribute"], UPDATE_WORKFLOW_STATUS_FIELDS)

export const DeleteWorkflowStatusParamsSchema = Schema.Struct({
  status: WorkflowStatusIdentifier.annotate({ description: "Status ID or exact case-insensitive name." }),
  ofAttribute: OptionalAttributeLocator
}).annotate({ title: "DeleteWorkflowStatusParams" })
export type DeleteWorkflowStatusParams = Schema.Schema.Type<typeof DeleteWorkflowStatusParamsSchema>

export const ListStatusCategoriesParamsSchema = Schema.Struct({
  ofAttribute: OptionalAttributeLocator,
  limit: Schema.optional(LimitParam.annotate({ description: "Maximum categories to return (default: 50)." }))
}).annotate({ title: "ListStatusCategoriesParams" })
export type ListStatusCategoriesParams = Schema.Schema.Type<typeof ListStatusCategoriesParamsSchema>

export const GetStatusCategoryParamsSchema = Schema.Struct({
  category: StatusCategoryIdentifier.annotate({ description: "Category ID or exact case-insensitive label." }),
  ofAttribute: OptionalAttributeLocator
}).annotate({ title: "GetStatusCategoryParams" })
export type GetStatusCategoryParams = Schema.Schema.Type<typeof GetStatusCategoryParamsSchema>

export const CreateStatusCategoryParamsSchema = Schema.Struct({
  ofAttribute: HulyAttributeIdentifier.annotate({ description: "Status attribute ID or exact attribute name." }),
  label: WorkflowLabelSchema,
  defaultStatus: WorkflowStatusIdentifier.annotate({
    description: "Status ID or exact name to use as the category default. It must belong to ofAttribute."
  }),
  icon: Schema.optional(WorkflowIconSchema),
  color: Schema.optional(WorkflowColorSchema),
  order: Schema.optional(Integer)
}).annotate({ title: "CreateStatusCategoryParams" })
export type CreateStatusCategoryParams = Schema.Schema.Type<typeof CreateStatusCategoryParamsSchema>

export const UPDATE_STATUS_CATEGORY_FIELDS = [
  "label",
  "ofAttribute",
  "defaultStatus",
  "icon",
  "color",
  "order"
] as const satisfies ReadonlyArray<"label" | "ofAttribute" | "defaultStatus" | "icon" | "color" | "order">

export const UpdateStatusCategoryParamsSchema = Schema.Struct({
  category: StatusCategoryIdentifier.annotate({ description: "Category ID or exact case-insensitive label." }),
  currentOfAttribute: OptionalAttributeLocator,
  label: Schema.optional(WorkflowLabelSchema),
  ofAttribute: Schema.optional(HulyAttributeIdentifier),
  defaultStatus: Schema.optional(
    WorkflowStatusIdentifier.annotate({
      description: "New default status ID or exact name. It must belong to the category's resulting attribute."
    })
  ),
  icon: Schema.optional(WorkflowIconSchema),
  color: Schema.optional(WorkflowColorSchema),
  order: Schema.optional(Integer)
})
  .check(
    Schema.makeFilter((params) =>
      UPDATE_STATUS_CATEGORY_FIELDS.some((field) => params[field] !== undefined)
        ? undefined
        : atLeastOneUpdateFieldMessage(UPDATE_STATUS_CATEGORY_FIELDS)
    )
  )
  .annotate({ title: "UpdateStatusCategoryParams" })
export type UpdateStatusCategoryParams = Schema.Schema.Type<typeof UpdateStatusCategoryParamsSchema>
assertUpdateFields<UpdateStatusCategoryParams>()(["category", "currentOfAttribute"], UPDATE_STATUS_CATEGORY_FIELDS)

export const DeleteStatusCategoryParamsSchema = Schema.Struct({
  category: StatusCategoryIdentifier.annotate({ description: "Category ID or exact case-insensitive label." }),
  ofAttribute: OptionalAttributeLocator
}).annotate({ title: "DeleteStatusCategoryParams" })
export type DeleteStatusCategoryParams = Schema.Schema.Type<typeof DeleteStatusCategoryParamsSchema>

export const listWorkflowStatusesParamsJsonSchema = toDraft07JsonSchema(ListWorkflowStatusesParamsSchema)
export const getWorkflowStatusParamsJsonSchema = toDraft07JsonSchema(GetWorkflowStatusParamsSchema)
export const createWorkflowStatusParamsJsonSchema = toDraft07JsonSchema(CreateWorkflowStatusParamsSchema)
export const updateWorkflowStatusParamsJsonSchema = withAtLeastOneRequired(
  toDraft07JsonSchema(UpdateWorkflowStatusParamsSchema),
  UPDATE_WORKFLOW_STATUS_FIELDS
)
export const deleteWorkflowStatusParamsJsonSchema = toDraft07JsonSchema(DeleteWorkflowStatusParamsSchema)
export const listStatusCategoriesParamsJsonSchema = toDraft07JsonSchema(ListStatusCategoriesParamsSchema)
export const getStatusCategoryParamsJsonSchema = toDraft07JsonSchema(GetStatusCategoryParamsSchema)
export const createStatusCategoryParamsJsonSchema = toDraft07JsonSchema(CreateStatusCategoryParamsSchema)
export const updateStatusCategoryParamsJsonSchema = withAtLeastOneRequired(
  toDraft07JsonSchema(UpdateStatusCategoryParamsSchema),
  UPDATE_STATUS_CATEGORY_FIELDS
)
export const deleteStatusCategoryParamsJsonSchema = toDraft07JsonSchema(DeleteStatusCategoryParamsSchema)

export const parseListWorkflowStatusesParams = Schema.decodeUnknownEffect(ListWorkflowStatusesParamsSchema)
export const parseGetWorkflowStatusParams = Schema.decodeUnknownEffect(GetWorkflowStatusParamsSchema)
export const parseCreateWorkflowStatusParams = Schema.decodeUnknownEffect(CreateWorkflowStatusParamsSchema)
export const parseUpdateWorkflowStatusParams = Schema.decodeUnknownEffect(UpdateWorkflowStatusParamsSchema)
export const parseDeleteWorkflowStatusParams = Schema.decodeUnknownEffect(DeleteWorkflowStatusParamsSchema)
export const parseListStatusCategoriesParams = Schema.decodeUnknownEffect(ListStatusCategoriesParamsSchema)
export const parseGetStatusCategoryParams = Schema.decodeUnknownEffect(GetStatusCategoryParamsSchema)
export const parseCreateStatusCategoryParams = Schema.decodeUnknownEffect(CreateStatusCategoryParamsSchema)
export const parseUpdateStatusCategoryParams = Schema.decodeUnknownEffect(UpdateStatusCategoryParamsSchema)
export const parseDeleteStatusCategoryParams = Schema.decodeUnknownEffect(DeleteStatusCategoryParamsSchema)
