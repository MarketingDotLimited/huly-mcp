import { Schema } from "effect"

import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import { LimitParam, NonEmptyString, PersonRefInput } from "./shared.js"

export const HrDate = Schema.String.pipe(Schema.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)), Schema.brand("HrDate"))
export type HrDate = Schema.Schema.Type<typeof HrDate>

export const HrRequestTypeSummarySchema = Schema.Struct({
  id: NonEmptyString,
  label: NonEmptyString,
  value: Schema.Number,
  color: Schema.Number
})
export const HrRequestSummarySchema = Schema.Struct({
  id: NonEmptyString,
  employeeId: NonEmptyString,
  departmentId: NonEmptyString,
  typeId: NonEmptyString,
  startDate: HrDate,
  endDate: HrDate,
  description: Schema.String,
  modifiedOn: Schema.Number
})
export type HrRequestSummary = Schema.Schema.Type<typeof HrRequestSummarySchema>

export const ListHrRequestTypesParamsSchema = Schema.Struct({})
export const ListHrRequestsParamsSchema = Schema.Struct({
  employee: Schema.optional(PersonRefInput),
  department: Schema.optional(NonEmptyString),
  startDate: Schema.optional(HrDate),
  endDate: Schema.optional(HrDate),
  limit: Schema.optional(LimitParam)
})
export const GetHrRequestParamsSchema = Schema.Struct({ requestId: NonEmptyString })
export const CreateHrRequestParamsSchema = Schema.Struct({
  employee: PersonRefInput,
  type: NonEmptyString,
  startDate: HrDate,
  endDate: HrDate,
  timezone: Schema.optional(NonEmptyString),
  description: Schema.optional(Schema.String)
})
export const UpdateHrRequestParamsSchema = Schema.Struct({
  requestId: NonEmptyString,
  type: Schema.optional(NonEmptyString),
  startDate: Schema.optional(HrDate),
  endDate: Schema.optional(HrDate),
  timezone: Schema.optional(NonEmptyString),
  description: Schema.optional(Schema.String)
})
export const DeleteHrRequestParamsSchema = GetHrRequestParamsSchema

export type ListHrRequestsParams = Schema.Schema.Type<typeof ListHrRequestsParamsSchema>
export type GetHrRequestParams = Schema.Schema.Type<typeof GetHrRequestParamsSchema>
export type CreateHrRequestParams = Schema.Schema.Type<typeof CreateHrRequestParamsSchema>
export type UpdateHrRequestParams = Schema.Schema.Type<typeof UpdateHrRequestParamsSchema>
export type DeleteHrRequestParams = Schema.Schema.Type<typeof DeleteHrRequestParamsSchema>

export const ListHrRequestTypesResultSchema = Schema.Struct({ types: Schema.Array(HrRequestTypeSummarySchema) })
export const ListHrRequestsResultSchema = Schema.Struct({ requests: Schema.Array(HrRequestSummarySchema) })
export const HrRequestMutationResultSchema = Schema.Struct({ request: HrRequestSummarySchema, changed: Schema.Boolean })
export const DeleteHrRequestResultSchema = Schema.Struct({ id: NonEmptyString, deleted: Schema.Boolean })

const descriptions = {
  employee: "Employee ID, exact email, or exact display name.",
  department: "Department ID, exact unique name, or hierarchy path.",
  type: "Request type ID or one of vacation, sick, pto, pto2, remote, overtime, overtime2.",
  startDate: "Inclusive start date in YYYY-MM-DD format.",
  endDate: "Inclusive end date in YYYY-MM-DD format.",
  timezone: "IANA timezone such as Europe/Berlin. Defaults to UTC.",
  description: "Request description in markdown.",
  requestId: "Huly HR Request document ID.",
  limit: "Maximum requests to return."
} as const

export const listHrRequestTypesParamsJsonSchema = toDraft07JsonSchema(ListHrRequestTypesParamsSchema)
export const listHrRequestsParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(ListHrRequestsParamsSchema),
  descriptions
)
export const getHrRequestParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(GetHrRequestParamsSchema),
  descriptions
)
export const createHrRequestParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(CreateHrRequestParamsSchema),
  descriptions
)
export const updateHrRequestParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(UpdateHrRequestParamsSchema),
  descriptions
)
export const deleteHrRequestParamsJsonSchema = getHrRequestParamsJsonSchema

export const parseListHrRequestTypesParams = Schema.decodeUnknownEffect(ListHrRequestTypesParamsSchema)
export const parseListHrRequestsParams = Schema.decodeUnknownEffect(ListHrRequestsParamsSchema)
export const parseGetHrRequestParams = Schema.decodeUnknownEffect(GetHrRequestParamsSchema)
export const parseCreateHrRequestParams = Schema.decodeUnknownEffect(CreateHrRequestParamsSchema)
export const parseUpdateHrRequestParams = Schema.decodeUnknownEffect(UpdateHrRequestParamsSchema)
export const parseDeleteHrRequestParams = Schema.decodeUnknownEffect(DeleteHrRequestParamsSchema)
