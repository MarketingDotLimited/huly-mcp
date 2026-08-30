import {
  createPublicHolidayParamsJsonSchema,
  DeletePublicHolidayResultSchema,
  deletePublicHolidayParamsJsonSchema,
  listPublicHolidaysParamsJsonSchema,
  ListPublicHolidaysResultSchema,
  parseCreatePublicHolidayParams,
  parseDeletePublicHolidayParams,
  parseListPublicHolidaysParams,
  parseUpdatePublicHolidayParams,
  PublicHolidayMutationResultSchema,
  updatePublicHolidayParamsJsonSchema
} from "../../domain/schemas/hr-holidays.js"
import {
  createHrRequestParamsJsonSchema,
  DeleteHrRequestResultSchema,
  deleteHrRequestParamsJsonSchema,
  getHrRequestParamsJsonSchema,
  HrRequestMutationResultSchema,
  HrRequestSummarySchema,
  listHrRequestsParamsJsonSchema,
  listHrRequestTypesParamsJsonSchema,
  ListHrRequestsResultSchema,
  ListHrRequestTypesResultSchema,
  parseCreateHrRequestParams,
  parseDeleteHrRequestParams,
  parseGetHrRequestParams,
  parseListHrRequestsParams,
  parseListHrRequestTypesParams,
  parseUpdateHrRequestParams,
  updateHrRequestParamsJsonSchema
} from "../../domain/schemas/hr-requests.js"
import {
  hrReportParamsJsonSchema,
  HrScheduleResultSchema,
  HrSummaryReportResultSchema,
  parseHrReportParams
} from "../../domain/schemas/hr-reports.js"
import {
  createPublicHoliday,
  deletePublicHoliday,
  listPublicHolidays,
  updatePublicHoliday
} from "../../huly/operations/hr-holidays.js"
import {
  createHrRequest,
  deleteHrRequest,
  getHrRequest,
  listHrRequests,
  listHrRequestTypes,
  updateHrRequest
} from "../../huly/operations/hr-requests.js"
import { getHrSchedule, getHrSummaryReport } from "../../huly/operations/hr-reports.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "hr" as const

export const hrRequestTools = [
  defineTool(
    {
      name: "list_hr_request_types",
      description: "List the HR leave, PTO, remote-work, sickness, and overtime request types installed in Huly.",
      category: CATEGORY,
      inputSchema: listHrRequestTypesParamsJsonSchema,
      resultSchema: ListHrRequestTypesResultSchema
    },
    parseListHrRequestTypesParams,
    listHrRequestTypes
  ),
  defineTool(
    {
      name: "list_hr_requests",
      description:
        "List HR requests, optionally filtered by employee, department, or overlapping date range. Descriptions are returned as markdown.",
      category: CATEGORY,
      inputSchema: listHrRequestsParamsJsonSchema,
      resultSchema: ListHrRequestsResultSchema
    },
    parseListHrRequestsParams,
    listHrRequests
  ),
  defineTool(
    {
      name: "get_hr_request",
      description: "Get one HR request by its Huly document ID, returning calendar dates and a markdown description.",
      category: CATEGORY,
      inputSchema: getHrRequestParamsJsonSchema,
      resultSchema: HrRequestSummarySchema
    },
    parseGetHrRequestParams,
    getHrRequest
  ),
  defineTool(
    {
      name: "create_hr_request",
      description:
        "Create a leave, PTO, sickness, remote-work, or overtime request for an assigned employee. The department is inferred from Staff.department.",
      category: CATEGORY,
      inputSchema: createHrRequestParamsJsonSchema,
      resultSchema: HrRequestMutationResultSchema
    },
    parseCreateHrRequestParams,
    createHrRequest
  ),
  defineTool(
    {
      name: "update_hr_request",
      description: "Update dates, type, or markdown description on an existing Huly HR request.",
      category: CATEGORY,
      inputSchema: updateHrRequestParamsJsonSchema,
      resultSchema: HrRequestMutationResultSchema
    },
    parseUpdateHrRequestParams,
    updateHrRequest
  ),
  defineTool(
    {
      name: "delete_hr_request",
      description: "Permanently delete an HR request. This action cannot be undone.",
      category: CATEGORY,
      inputSchema: deleteHrRequestParamsJsonSchema,
      resultSchema: DeleteHrRequestResultSchema,
      annotations: { destructiveHint: true, idempotentHint: true }
    },
    parseDeleteHrRequestParams,
    deleteHrRequest
  ),
  defineTool(
    {
      name: "list_public_holidays",
      description:
        "List Huly public holidays by department and date range, optionally including holidays inherited from ancestor departments.",
      category: CATEGORY,
      inputSchema: listPublicHolidaysParamsJsonSchema,
      resultSchema: ListPublicHolidaysResultSchema
    },
    parseListPublicHolidaysParams,
    listPublicHolidays
  ),
  defineTool(
    {
      name: "create_public_holiday",
      description: "Idempotently create a real Huly PublicHoliday for one department and calendar date.",
      category: CATEGORY,
      inputSchema: createPublicHolidayParamsJsonSchema,
      resultSchema: PublicHolidayMutationResultSchema
    },
    parseCreatePublicHolidayParams,
    createPublicHoliday
  ),
  defineTool(
    {
      name: "update_public_holiday",
      description: "Update a Huly PublicHoliday title, description, calendar date, or department.",
      category: CATEGORY,
      inputSchema: updatePublicHolidayParamsJsonSchema,
      resultSchema: PublicHolidayMutationResultSchema
    },
    parseUpdatePublicHolidayParams,
    updatePublicHoliday
  ),
  defineTool(
    {
      name: "delete_public_holiday",
      description: "Permanently delete a Huly PublicHoliday. This action cannot be undone.",
      category: CATEGORY,
      inputSchema: deletePublicHolidayParamsJsonSchema,
      resultSchema: DeletePublicHolidayResultSchema,
      annotations: { destructiveHint: true, idempotentHint: true }
    },
    parseDeletePublicHolidayParams,
    deletePublicHoliday
  ),
  defineTool(
    {
      name: "get_hr_schedule",
      description: "Return HR requests and applicable public holidays for a date range and optional department.",
      category: CATEGORY,
      inputSchema: hrReportParamsJsonSchema,
      resultSchema: HrScheduleResultSchema
    },
    parseHrReportParams,
    getHrSchedule
  ),
  defineTool(
    {
      name: "get_hr_summary_report",
      description:
        "Summarize HR request counts and calendar days by department and request type, plus applicable public holidays.",
      category: CATEGORY,
      inputSchema: hrReportParamsJsonSchema,
      resultSchema: HrSummaryReportResultSchema
    },
    parseHrReportParams,
    getHrSummaryReport
  )
] as const satisfies ReadonlyArray<RegisteredTool>
