import { Effect } from "effect"

import type { HrReportParams } from "../../domain/schemas/hr-reports.js"
import type { HrRequestSummary } from "../../domain/schemas/hr-requests.js"
import { NonEmptyString } from "../../domain/schemas/shared.js"
import { ensureDateOrder } from "./hr-dates.js"
import { listPublicHolidays } from "./hr-holidays.js"
import { listHrRequests } from "./hr-requests.js"

const MILLISECONDS_PER_DAY = 86_400_000

const calendarDays = (request: HrRequestSummary): number => {
  const start = Date.parse(`${request.startDate}T00:00:00Z`)
  const end = Date.parse(`${request.endDate}T00:00:00Z`)
  return Math.floor((end - start) / MILLISECONDS_PER_DAY) + 1
}

export const getHrSchedule = (params: HrReportParams) =>
  Effect.gen(function* () {
    yield* ensureDateOrder(params.startDate, params.endDate)
    const requests = yield* listHrRequests({
      startDate: params.startDate,
      endDate: params.endDate,
      ...(params.department === undefined ? {} : { department: params.department }),
      limit: 200
    })
    const holidays = yield* listPublicHolidays({
      startDate: params.startDate,
      endDate: params.endDate,
      ...(params.department === undefined ? {} : { department: params.department }),
      includeInherited: params.includeInheritedHolidays ?? true,
      limit: 200
    })
    return {
      startDate: params.startDate,
      endDate: params.endDate,
      requests: requests.requests,
      holidays: holidays.holidays
    }
  })

export const getHrSummaryReport = (params: HrReportParams) =>
  Effect.gen(function* () {
    const schedule = yield* getHrSchedule(params)
    const groups = new Map<
      string,
      { departmentId: string; typeId: string; requestCount: number; calendarDays: number }
    >()
    for (const request of schedule.requests) {
      const key = `${request.departmentId}\0${request.typeId}`
      const current = groups.get(key) ?? {
        departmentId: request.departmentId,
        typeId: request.typeId,
        requestCount: 0,
        calendarDays: 0
      }
      groups.set(key, {
        ...current,
        requestCount: current.requestCount + 1,
        calendarDays: current.calendarDays + calendarDays(request)
      })
    }
    const resultGroups = [...groups.values()].map((group) => ({
      ...group,
      departmentId: NonEmptyString.make(group.departmentId),
      typeId: NonEmptyString.make(group.typeId)
    }))
    return {
      startDate: params.startDate,
      endDate: params.endDate,
      totalRequests: schedule.requests.length,
      totalCalendarDays: resultGroups.reduce((total, group) => total + group.calendarDays, 0),
      publicHolidayCount: schedule.holidays.length,
      groups: resultGroups
    }
  })
