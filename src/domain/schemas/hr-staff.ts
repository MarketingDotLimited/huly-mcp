import { Schema } from "effect"

import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import { LimitParam, NonEmptyString, PersonRefInput } from "./shared.js"

export const StaffSummarySchema = Schema.Struct({
  employeeId: NonEmptyString,
  name: NonEmptyString,
  email: Schema.optional(NonEmptyString),
  active: Schema.Boolean,
  departmentId: Schema.optional(NonEmptyString),
  position: Schema.optional(Schema.String)
})
export type StaffSummary = Schema.Schema.Type<typeof StaffSummarySchema>

export const ListStaffParamsSchema = Schema.Struct({
  department: Schema.optional(NonEmptyString),
  includeInactive: Schema.optional(Schema.Boolean),
  limit: Schema.optional(LimitParam)
})
export const SetEmployeeDepartmentParamsSchema = Schema.Struct({ employee: PersonRefInput, department: NonEmptyString })
export const SetEmployeePositionParamsSchema = Schema.Struct({
  employee: PersonRefInput,
  position: Schema.NullOr(Schema.String)
})

export type ListStaffParams = Schema.Schema.Type<typeof ListStaffParamsSchema>
export type SetEmployeeDepartmentParams = Schema.Schema.Type<typeof SetEmployeeDepartmentParamsSchema>
export type SetEmployeePositionParams = Schema.Schema.Type<typeof SetEmployeePositionParamsSchema>

export const ListStaffResultSchema = Schema.Struct({ staff: Schema.Array(StaffSummarySchema) })
export const StaffMutationResultSchema = Schema.Struct({ staff: StaffSummarySchema, changed: Schema.Boolean })
export type ListStaffResult = Schema.Schema.Type<typeof ListStaffResultSchema>
export type StaffMutationResult = Schema.Schema.Type<typeof StaffMutationResultSchema>

const descriptions = {
  employee: "Employee ID, exact email, or exact display name.",
  department: "Department ID, exact unique name, or slash-separated hierarchy path.",
  position: "Official employee position. Use null to clear it.",
  includeInactive: "Include inactive employees. Defaults to false.",
  limit: "Maximum employees to return."
} as const

export const listStaffParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(ListStaffParamsSchema),
  descriptions
)
export const setEmployeeDepartmentParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(SetEmployeeDepartmentParamsSchema),
  descriptions
)
export const setEmployeePositionParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(SetEmployeePositionParamsSchema),
  descriptions
)

export const parseListStaffParams = Schema.decodeUnknownEffect(ListStaffParamsSchema)
export const parseSetEmployeeDepartmentParams = Schema.decodeUnknownEffect(SetEmployeeDepartmentParamsSchema)
export const parseSetEmployeePositionParams = Schema.decodeUnknownEffect(SetEmployeePositionParamsSchema)
