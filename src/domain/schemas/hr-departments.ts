import { Schema } from "effect"

import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import { NonEmptyString, PersonRefInput } from "./shared.js"

export const DepartmentIdentifier = NonEmptyString.pipe(Schema.brand("DepartmentIdentifier"))
export type DepartmentIdentifier = Schema.Schema.Type<typeof DepartmentIdentifier>

export const DepartmentSummarySchema = Schema.Struct({
  id: NonEmptyString,
  name: NonEmptyString,
  description: Schema.String,
  parentId: Schema.optional(NonEmptyString),
  path: NonEmptyString,
  teamLeadId: Schema.NullOr(NonEmptyString),
  managerIds: Schema.Array(NonEmptyString),
  memberIds: Schema.Array(NonEmptyString),
  directMemberIds: Schema.Array(NonEmptyString),
  modifiedOn: Schema.Number
})
export type DepartmentSummary = Schema.Schema.Type<typeof DepartmentSummarySchema>

export const ListDepartmentsParamsSchema = Schema.Struct({ includeRoot: Schema.optional(Schema.Boolean) })
export const GetDepartmentParamsSchema = Schema.Struct({ department: DepartmentIdentifier })
export const CreateDepartmentParamsSchema = Schema.Struct({
  name: NonEmptyString,
  description: Schema.optional(Schema.String),
  parent: Schema.optional(DepartmentIdentifier),
  teamLead: Schema.optional(Schema.NullOr(PersonRefInput)),
  managers: Schema.optional(Schema.Array(PersonRefInput))
})
export const UpdateDepartmentParamsSchema = Schema.Struct({
  department: DepartmentIdentifier,
  name: Schema.optional(NonEmptyString),
  description: Schema.optional(Schema.String),
  parent: Schema.optional(DepartmentIdentifier),
  teamLead: Schema.optional(Schema.NullOr(PersonRefInput)),
  managers: Schema.optional(Schema.Array(PersonRefInput))
})
export const DeleteDepartmentParamsSchema = Schema.Struct({ department: DepartmentIdentifier })
export const ReconcileDepartmentMembersParamsSchema = Schema.Struct({ dryRun: Schema.optional(Schema.Boolean) })

export type ListDepartmentsParams = Schema.Schema.Type<typeof ListDepartmentsParamsSchema>
export type GetDepartmentParams = Schema.Schema.Type<typeof GetDepartmentParamsSchema>
export type CreateDepartmentParams = Schema.Schema.Type<typeof CreateDepartmentParamsSchema>
export type UpdateDepartmentParams = Schema.Schema.Type<typeof UpdateDepartmentParamsSchema>
export type DeleteDepartmentParams = Schema.Schema.Type<typeof DeleteDepartmentParamsSchema>
export type ReconcileDepartmentMembersParams = Schema.Schema.Type<typeof ReconcileDepartmentMembersParamsSchema>

export const ListDepartmentsResultSchema = Schema.Struct({ departments: Schema.Array(DepartmentSummarySchema) })
export const DepartmentMutationResultSchema = Schema.Struct({
  department: DepartmentSummarySchema,
  changed: Schema.Boolean
})
export const DeleteDepartmentResultSchema = Schema.Struct({ id: NonEmptyString, deleted: Schema.Boolean })
export const ReconcileDepartmentMembersResultSchema = Schema.Struct({
  changedDepartmentIds: Schema.Array(NonEmptyString),
  dryRun: Schema.Boolean
})

export type ListDepartmentsResult = Schema.Schema.Type<typeof ListDepartmentsResultSchema>
export type DepartmentMutationResult = Schema.Schema.Type<typeof DepartmentMutationResultSchema>
export type DeleteDepartmentResult = Schema.Schema.Type<typeof DeleteDepartmentResultSchema>
export type ReconcileDepartmentMembersResult = Schema.Schema.Type<typeof ReconcileDepartmentMembersResultSchema>

const descriptions = {
  department: "Department ID, exact unique name, or slash-separated hierarchy path.",
  name: "Department name.",
  description: "Department description.",
  parent: "Parent department ID, exact unique name, or hierarchy path. Defaults to Organization.",
  teamLead: "Active employee ID, exact email, or exact display name; null clears the lead.",
  managers: "Active employee IDs, exact emails, or exact display names.",
  includeRoot: "Include the built-in Organization root department.",
  dryRun: "Report membership corrections without writing them. Defaults to false."
} as const

export const listDepartmentsParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(ListDepartmentsParamsSchema),
  descriptions
)
export const getDepartmentParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(GetDepartmentParamsSchema),
  descriptions
)
export const createDepartmentParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(CreateDepartmentParamsSchema),
  descriptions
)
export const updateDepartmentParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(UpdateDepartmentParamsSchema),
  descriptions
)
export const deleteDepartmentParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(DeleteDepartmentParamsSchema),
  descriptions
)
export const reconcileDepartmentMembersParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(ReconcileDepartmentMembersParamsSchema),
  descriptions
)

export const parseListDepartmentsParams = Schema.decodeUnknownEffect(ListDepartmentsParamsSchema)
export const parseGetDepartmentParams = Schema.decodeUnknownEffect(GetDepartmentParamsSchema)
export const parseCreateDepartmentParams = Schema.decodeUnknownEffect(CreateDepartmentParamsSchema)
export const parseUpdateDepartmentParams = Schema.decodeUnknownEffect(UpdateDepartmentParamsSchema)
export const parseDeleteDepartmentParams = Schema.decodeUnknownEffect(DeleteDepartmentParamsSchema)
export const parseReconcileDepartmentMembersParams = Schema.decodeUnknownEffect(ReconcileDepartmentMembersParamsSchema)
