import type { Asset, IntlString } from "@hcengineering/platform"
import { JSONSchema, Schema } from "effect"

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

const SdkAssetSchema = Schema.declare((input): input is Asset => typeof input === "string")
const SdkIntlStringSchema = Schema.declare((input): input is IntlString => typeof input === "string")

export const WorkflowIconSchema = NonEmptyString.pipe(Schema.compose(SdkAssetSchema)).annotations({
  identifier: "WorkflowIcon",
  title: "WorkflowIcon",
  description: "Exact Huly asset identifier for a status-category icon.",
  jsonSchema: { type: "string", minLength: 1 }
})
export type WorkflowIcon = Schema.Schema.Type<typeof WorkflowIconSchema>

export const WorkflowLabelSchema = NonEmptyString.pipe(Schema.compose(SdkIntlStringSchema)).annotations({
  identifier: "WorkflowLabel",
  title: "WorkflowLabel",
  description: "Status-category label text or Huly internationalized-string identifier.",
  jsonSchema: { type: "string", minLength: 1 }
})
export type WorkflowLabel = Schema.Schema.Type<typeof WorkflowLabelSchema>

export const WorkflowColorSchema = Schema.Union(Integer, Schema.Array(Integer).pipe(Schema.minItems(1))).annotations({
  identifier: "WorkflowColor",
  title: "WorkflowColor",
  description: "Huly numeric color token or non-empty numeric gradient token array."
})
export type WorkflowColor = Schema.Schema.Type<typeof WorkflowColorSchema>

const OptionalAttributeLocator = Schema.optional(
  HulyAttributeIdentifier.annotations({
    description:
      "Status attribute ID or exact attribute name. Use this to filter results and disambiguate names shared across attributes."
  })
)

export const ListWorkflowStatusesParamsSchema = Schema.Struct({
  ofAttribute: OptionalAttributeLocator,
  category: Schema.optional(
    StatusCategoryIdentifier.annotations({ description: "Category ID or exact label to filter by." })
  ),
  limit: Schema.optional(LimitParam.annotations({ description: "Maximum statuses to return (default: 50)." }))
}).annotations({ title: "ListWorkflowStatusesParams" })
export type ListWorkflowStatusesParams = Schema.Schema.Type<typeof ListWorkflowStatusesParamsSchema>

export const GetWorkflowStatusParamsSchema = Schema.Struct({
  status: WorkflowStatusIdentifier.annotations({ description: "Status ID or exact case-insensitive name." }),
  ofAttribute: OptionalAttributeLocator
}).annotations({ title: "GetWorkflowStatusParams" })
export type GetWorkflowStatusParams = Schema.Schema.Type<typeof GetWorkflowStatusParamsSchema>

export const CreateWorkflowStatusParamsSchema = Schema.Struct({
  ofAttribute: HulyAttributeIdentifier.annotations({ description: "Status attribute ID or exact attribute name." }),
  name: StatusName.annotations({ description: "Workflow status display name." }),
  category: Schema.optional(
    StatusCategoryIdentifier.annotations({
      description:
        "Category ID or exact label. Categories may be shared across status attributes; pass an ID when a label is ambiguous."
    })
  ),
  color: Schema.optional(WorkflowColorSchema),
  description: Schema.optional(NonEmptyString)
}).annotations({ title: "CreateWorkflowStatusParams" })
export type CreateWorkflowStatusParams = Schema.Schema.Type<typeof CreateWorkflowStatusParamsSchema>

export const UPDATE_WORKFLOW_STATUS_FIELDS = [
  "name",
  "ofAttribute",
  "category",
  "color",
  "description"
] as const satisfies ReadonlyArray<"name" | "ofAttribute" | "category" | "color" | "description">

export const UpdateWorkflowStatusParamsSchema = Schema.Struct({
  status: WorkflowStatusIdentifier.annotations({ description: "Status ID or exact case-insensitive name." }),
  currentOfAttribute: OptionalAttributeLocator,
  name: Schema.optional(StatusName.annotations({ description: "New display name." })),
  ofAttribute: Schema.optional(
    HulyAttributeIdentifier.annotations({
      description:
        "New owning attribute. Moves are rejected while the status is referenced or when the target attribute requires a different concrete Status class."
    })
  ),
  category: Schema.optional(
    Schema.NullOr(StatusCategoryIdentifier).annotations({
      description:
        "New category ID or exact label; pass null to remove the relationship. Categories may be shared across status attributes."
    })
  ),
  color: Schema.optional(
    Schema.NullOr(WorkflowColorSchema).annotations({ description: "New color; pass null to clear it." })
  ),
  description: Schema.optional(
    Schema.NullOr(NonEmptyString).annotations({ description: "New description; pass null to clear it." })
  )
})
  .pipe(
    Schema.filter((params) =>
      UPDATE_WORKFLOW_STATUS_FIELDS.some((field) => params[field] !== undefined)
        ? undefined
        : atLeastOneUpdateFieldMessage(UPDATE_WORKFLOW_STATUS_FIELDS)
    )
  )
  .annotations({ title: "UpdateWorkflowStatusParams" })
export type UpdateWorkflowStatusParams = Schema.Schema.Type<typeof UpdateWorkflowStatusParamsSchema>
assertUpdateFields<UpdateWorkflowStatusParams>()(["status", "currentOfAttribute"], UPDATE_WORKFLOW_STATUS_FIELDS)

export const DeleteWorkflowStatusParamsSchema = Schema.Struct({
  status: WorkflowStatusIdentifier.annotations({ description: "Status ID or exact case-insensitive name." }),
  ofAttribute: OptionalAttributeLocator
}).annotations({ title: "DeleteWorkflowStatusParams" })
export type DeleteWorkflowStatusParams = Schema.Schema.Type<typeof DeleteWorkflowStatusParamsSchema>

export const ListStatusCategoriesParamsSchema = Schema.Struct({
  ofAttribute: OptionalAttributeLocator,
  limit: Schema.optional(LimitParam.annotations({ description: "Maximum categories to return (default: 50)." }))
}).annotations({ title: "ListStatusCategoriesParams" })
export type ListStatusCategoriesParams = Schema.Schema.Type<typeof ListStatusCategoriesParamsSchema>

export const GetStatusCategoryParamsSchema = Schema.Struct({
  category: StatusCategoryIdentifier.annotations({ description: "Category ID or exact case-insensitive label." }),
  ofAttribute: OptionalAttributeLocator
}).annotations({ title: "GetStatusCategoryParams" })
export type GetStatusCategoryParams = Schema.Schema.Type<typeof GetStatusCategoryParamsSchema>

export const CreateStatusCategoryParamsSchema = Schema.Struct({
  ofAttribute: HulyAttributeIdentifier.annotations({ description: "Status attribute ID or exact attribute name." }),
  label: WorkflowLabelSchema,
  defaultStatus: WorkflowStatusIdentifier.annotations({
    description: "Status ID or exact name to use as the category default. It must belong to ofAttribute."
  }),
  icon: Schema.optional(WorkflowIconSchema),
  color: Schema.optional(WorkflowColorSchema),
  order: Schema.optional(Integer)
}).annotations({ title: "CreateStatusCategoryParams" })
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
  category: StatusCategoryIdentifier.annotations({ description: "Category ID or exact case-insensitive label." }),
  currentOfAttribute: OptionalAttributeLocator,
  label: Schema.optional(WorkflowLabelSchema),
  ofAttribute: Schema.optional(HulyAttributeIdentifier),
  defaultStatus: Schema.optional(
    WorkflowStatusIdentifier.annotations({
      description: "New default status ID or exact name. It must belong to the category's resulting attribute."
    })
  ),
  icon: Schema.optional(WorkflowIconSchema),
  color: Schema.optional(WorkflowColorSchema),
  order: Schema.optional(Integer)
})
  .pipe(
    Schema.filter((params) =>
      UPDATE_STATUS_CATEGORY_FIELDS.some((field) => params[field] !== undefined)
        ? undefined
        : atLeastOneUpdateFieldMessage(UPDATE_STATUS_CATEGORY_FIELDS)
    )
  )
  .annotations({ title: "UpdateStatusCategoryParams" })
export type UpdateStatusCategoryParams = Schema.Schema.Type<typeof UpdateStatusCategoryParamsSchema>
assertUpdateFields<UpdateStatusCategoryParams>()(["category", "currentOfAttribute"], UPDATE_STATUS_CATEGORY_FIELDS)

export const DeleteStatusCategoryParamsSchema = Schema.Struct({
  category: StatusCategoryIdentifier.annotations({ description: "Category ID or exact case-insensitive label." }),
  ofAttribute: OptionalAttributeLocator
}).annotations({ title: "DeleteStatusCategoryParams" })
export type DeleteStatusCategoryParams = Schema.Schema.Type<typeof DeleteStatusCategoryParamsSchema>

export const listWorkflowStatusesParamsJsonSchema = JSONSchema.make(ListWorkflowStatusesParamsSchema)
export const getWorkflowStatusParamsJsonSchema = JSONSchema.make(GetWorkflowStatusParamsSchema)
export const createWorkflowStatusParamsJsonSchema = JSONSchema.make(CreateWorkflowStatusParamsSchema)
export const updateWorkflowStatusParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateWorkflowStatusParamsSchema),
  UPDATE_WORKFLOW_STATUS_FIELDS
)
export const deleteWorkflowStatusParamsJsonSchema = JSONSchema.make(DeleteWorkflowStatusParamsSchema)
export const listStatusCategoriesParamsJsonSchema = JSONSchema.make(ListStatusCategoriesParamsSchema)
export const getStatusCategoryParamsJsonSchema = JSONSchema.make(GetStatusCategoryParamsSchema)
export const createStatusCategoryParamsJsonSchema = JSONSchema.make(CreateStatusCategoryParamsSchema)
export const updateStatusCategoryParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateStatusCategoryParamsSchema),
  UPDATE_STATUS_CATEGORY_FIELDS
)
export const deleteStatusCategoryParamsJsonSchema = JSONSchema.make(DeleteStatusCategoryParamsSchema)

export const parseListWorkflowStatusesParams = Schema.decodeUnknown(ListWorkflowStatusesParamsSchema)
export const parseGetWorkflowStatusParams = Schema.decodeUnknown(GetWorkflowStatusParamsSchema)
export const parseCreateWorkflowStatusParams = Schema.decodeUnknown(CreateWorkflowStatusParamsSchema)
export const parseUpdateWorkflowStatusParams = Schema.decodeUnknown(UpdateWorkflowStatusParamsSchema)
export const parseDeleteWorkflowStatusParams = Schema.decodeUnknown(DeleteWorkflowStatusParamsSchema)
export const parseListStatusCategoriesParams = Schema.decodeUnknown(ListStatusCategoriesParamsSchema)
export const parseGetStatusCategoryParams = Schema.decodeUnknown(GetStatusCategoryParamsSchema)
export const parseCreateStatusCategoryParams = Schema.decodeUnknown(CreateStatusCategoryParamsSchema)
export const parseUpdateStatusCategoryParams = Schema.decodeUnknown(UpdateStatusCategoryParamsSchema)
export const parseDeleteStatusCategoryParams = Schema.decodeUnknown(DeleteStatusCategoryParamsSchema)
