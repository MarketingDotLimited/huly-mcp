import { Schema } from "effect"

import { PublicHolidaySummarySchema } from "./hr-holidays.js"
import { HrDate, HrRequestSummarySchema } from "./hr-requests.js"
import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import { NonEmptyString } from "./shared.js"

export const HrReportParamsSchema = Schema.Struct({
  startDate: HrDate,
  endDate: HrDate,
  department: Schema.optional(NonEmptyString),
  includeInheritedHolidays: Schema.optional(Schema.Boolean)
})
export type HrReportParams = Schema.Schema.Type<typeof HrReportParamsSchema>

export const HrScheduleResultSchema = Schema.Struct({
  startDate: HrDate,
  endDate: HrDate,
  requests: Schema.Array(HrRequestSummarySchema),
  holidays: Schema.Array(PublicHolidaySummarySchema)
})
export const HrReportGroupSchema = Schema.Struct({
  departmentId: NonEmptyString,
  typeId: NonEmptyString,
  requestCount: Schema.Number,
  calendarDays: Schema.Number
})
export const HrSummaryReportResultSchema = Schema.Struct({
  startDate: HrDate,
  endDate: HrDate,
  totalRequests: Schema.Number,
  totalCalendarDays: Schema.Number,
  publicHolidayCount: Schema.Number,
  groups: Schema.Array(HrReportGroupSchema)
})

export const hrReportParamsJsonSchema = withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(HrReportParamsSchema), {
  startDate: "Inclusive report start in YYYY-MM-DD format.",
  endDate: "Inclusive report end in YYYY-MM-DD format.",
  department: "Optional department ID, exact unique name, or hierarchy path.",
  includeInheritedHolidays: "Include holidays inherited from ancestor departments. Defaults to true."
})
export const parseHrReportParams = Schema.decodeUnknownEffect(HrReportParamsSchema)
