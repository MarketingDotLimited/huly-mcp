import { Schema } from "effect"

import { HrDate } from "./hr-requests.js"
import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import { LimitParam, NonEmptyString } from "./shared.js"

export const PublicHolidaySummarySchema = Schema.Struct({
  id: NonEmptyString,
  title: NonEmptyString,
  description: Schema.String,
  date: HrDate,
  departmentId: NonEmptyString,
  modifiedOn: Schema.Number
})
export const ListPublicHolidaysParamsSchema = Schema.Struct({
  department: Schema.optional(NonEmptyString),
  startDate: Schema.optional(HrDate),
  endDate: Schema.optional(HrDate),
  includeInherited: Schema.optional(Schema.Boolean),
  limit: Schema.optional(LimitParam)
})
export const CreatePublicHolidayParamsSchema = Schema.Struct({
  title: NonEmptyString,
  description: Schema.optional(Schema.String),
  date: HrDate,
  timezone: Schema.optional(NonEmptyString),
  department: NonEmptyString
})
export const UpdatePublicHolidayParamsSchema = Schema.Struct({
  holidayId: NonEmptyString,
  title: Schema.optional(NonEmptyString),
  description: Schema.optional(Schema.String),
  date: Schema.optional(HrDate),
  timezone: Schema.optional(NonEmptyString),
  department: Schema.optional(NonEmptyString)
})
export const DeletePublicHolidayParamsSchema = Schema.Struct({ holidayId: NonEmptyString })

export type ListPublicHolidaysParams = Schema.Schema.Type<typeof ListPublicHolidaysParamsSchema>
export type CreatePublicHolidayParams = Schema.Schema.Type<typeof CreatePublicHolidayParamsSchema>
export type UpdatePublicHolidayParams = Schema.Schema.Type<typeof UpdatePublicHolidayParamsSchema>
export type DeletePublicHolidayParams = Schema.Schema.Type<typeof DeletePublicHolidayParamsSchema>

export const ListPublicHolidaysResultSchema = Schema.Struct({ holidays: Schema.Array(PublicHolidaySummarySchema) })
export const PublicHolidayMutationResultSchema = Schema.Struct({
  holiday: PublicHolidaySummarySchema,
  changed: Schema.Boolean
})
export const DeletePublicHolidayResultSchema = Schema.Struct({ id: NonEmptyString, deleted: Schema.Boolean })

const descriptions = {
  holidayId: "Huly PublicHoliday document ID.",
  title: "Holiday title.",
  description: "Holiday description.",
  date: "Holiday date in YYYY-MM-DD format.",
  timezone: "IANA timezone such as Europe/Berlin. Defaults to UTC.",
  department: "Department ID, exact unique name, or hierarchy path.",
  startDate: "Inclusive start date in YYYY-MM-DD format.",
  endDate: "Inclusive end date in YYYY-MM-DD format.",
  includeInherited: "Include holidays from ancestor departments.",
  limit: "Maximum holidays to return."
} as const

export const listPublicHolidaysParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(ListPublicHolidaysParamsSchema),
  descriptions
)
export const createPublicHolidayParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(CreatePublicHolidayParamsSchema),
  descriptions
)
export const updatePublicHolidayParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(UpdatePublicHolidayParamsSchema),
  descriptions
)
export const deletePublicHolidayParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(DeletePublicHolidayParamsSchema),
  descriptions
)

export const parseListPublicHolidaysParams = Schema.decodeUnknownEffect(ListPublicHolidaysParamsSchema)
export const parseCreatePublicHolidayParams = Schema.decodeUnknownEffect(CreatePublicHolidayParamsSchema)
export const parseUpdatePublicHolidayParams = Schema.decodeUnknownEffect(UpdatePublicHolidayParamsSchema)
export const parseDeletePublicHolidayParams = Schema.decodeUnknownEffect(DeletePublicHolidayParamsSchema)
