import type { Department, PublicHoliday } from "@hcengineering/hr"
import { SortingOrder, type Data, type DocumentUpdate, type Ref } from "@hcengineering/core"
import { Clock, Effect } from "effect"

import {
  type CreatePublicHolidayParams,
  type DeletePublicHolidayParams,
  type ListPublicHolidaysParams,
  type UpdatePublicHolidayParams
} from "../../domain/schemas/hr-holidays.js"
import { NonEmptyString } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { HulyError } from "../errors.js"
import { core, hr } from "../huly-plugins.js"
import { formatTzDate, makeTzDate } from "./hr-dates.js"
import { loadDepartmentGraph, resolveDepartment, type HrResolutionError } from "./hr-shared.js"
import { clampLimit, hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

type HolidayError = HulyClientError | HulyError | HrResolutionError

const summary = (holiday: PublicHoliday) => ({
  id: NonEmptyString.make(holiday._id),
  title: NonEmptyString.make(holiday.title),
  description: holiday.description,
  date: formatTzDate(holiday.date),
  departmentId: NonEmptyString.make(holiday.department),
  modifiedOn: holiday.modifiedOn
})

const findHoliday = (client: HulyClient["Service"], holidayId: string): Effect.Effect<PublicHoliday, HolidayError> =>
  client
    .findOne<PublicHoliday>(hr.class.PublicHoliday, hulyQuery<PublicHoliday>({ _id: toRef<PublicHoliday>(holidayId) }))
    .pipe(
      Effect.flatMap((holiday) =>
        holiday === undefined
          ? Effect.fail(new HulyError({ message: `Public holiday '${holidayId}' not found` }))
          : Effect.succeed(holiday)
      )
    )

const holidayUpdates = (
  client: HulyClient["Service"],
  current: PublicHoliday,
  params: UpdatePublicHolidayParams
): Effect.Effect<DocumentUpdate<PublicHoliday>, HolidayError> =>
  Effect.gen(function* () {
    const operations: DocumentUpdate<PublicHoliday> = {}
    if (params.title !== undefined && params.title !== current.title) operations.title = params.title
    if (params.description !== undefined && params.description !== current.description) {
      operations.description = params.description
    }
    if (params.date !== undefined) operations.date = yield* makeTzDate(params.date, params.timezone)
    if (params.department !== undefined) {
      const graph = yield* loadDepartmentGraph(client)
      const department = yield* resolveDepartment(graph, params.department)
      if (department._id !== current.department) operations.department = department._id
    }
    return operations
  })

const ancestorIds = (
  department: Department,
  byId: ReadonlyMap<Ref<Department>, Department>
): ReadonlySet<Ref<Department>> => {
  const ids = new Set<Ref<Department>>([department._id])
  let current = department.parent
  while (current !== undefined && !ids.has(current)) {
    ids.add(current)
    current = byId.get(current)?.parent
  }
  return ids
}

export const listPublicHolidays = (
  params: ListPublicHolidaysParams
): Effect.Effect<{ readonly holidays: ReadonlyArray<ReturnType<typeof summary>> }, HolidayError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const graph = yield* loadDepartmentGraph(client)
    const department = params.department === undefined ? undefined : yield* resolveDepartment(graph, params.department)
    const allowedDepartments =
      department === undefined
        ? undefined
        : params.includeInherited === true
          ? ancestorIds(department, graph.byId)
          : new Set([department._id])
    const holidays = yield* client.findAll<PublicHoliday>(
      hr.class.PublicHoliday,
      {},
      { limit: clampLimit(params.limit), sort: { modifiedOn: SortingOrder.Descending } }
    )
    return {
      holidays: holidays
        .filter((holiday) => {
          const date = formatTzDate(holiday.date)
          return (
            (allowedDepartments === undefined || allowedDepartments.has(holiday.department)) &&
            (params.startDate === undefined || date >= params.startDate) &&
            (params.endDate === undefined || date <= params.endDate)
          )
        })
        .map(summary)
    }
  })

export const createPublicHoliday = (
  params: CreatePublicHolidayParams
): Effect.Effect<
  { readonly holiday: ReturnType<typeof summary>; readonly changed: boolean },
  HolidayError,
  HulyClient
> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const department = yield* resolveDepartment(yield* loadDepartmentGraph(client), params.department)
    const date = yield* makeTzDate(params.date, params.timezone)
    const existing = yield* client.findAll<PublicHoliday>(
      hr.class.PublicHoliday,
      hulyQuery<PublicHoliday>({ department: department._id, date })
    )
    const match = existing[0]
    if (match !== undefined) {
      if (match.title === params.title && match.description === (params.description ?? "")) {
        return { holiday: summary(match), changed: false }
      }
      return yield* new HulyError({
        message: `A public holiday already exists for '${params.date}' in this department`
      })
    }
    const attributes: Data<PublicHoliday> = {
      title: params.title,
      description: params.description ?? "",
      date,
      department: department._id
    }
    const id = yield* client.createDoc(hr.class.PublicHoliday, core.space.Workspace, attributes)
    return {
      changed: true,
      holiday: summary({
        ...attributes,
        _id: id,
        _class: hr.class.PublicHoliday,
        space: core.space.Workspace,
        modifiedOn: yield* Clock.currentTimeMillis,
        modifiedBy: client.getPrimarySocialId()
      })
    }
  })

export const updatePublicHoliday = (
  params: UpdatePublicHolidayParams
): Effect.Effect<
  { readonly holiday: ReturnType<typeof summary>; readonly changed: boolean },
  HolidayError,
  HulyClient
> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const current = yield* findHoliday(client, params.holidayId)
    const operations = yield* holidayUpdates(client, current, params)
    const changed = Object.keys(operations).length > 0
    if (changed) yield* client.updateDoc(hr.class.PublicHoliday, core.space.Workspace, current._id, operations)
    return {
      holiday: summary({
        ...current,
        ...operations,
        modifiedOn: changed ? yield* Clock.currentTimeMillis : current.modifiedOn
      }),
      changed
    }
  })

export const deletePublicHoliday = (
  params: DeletePublicHolidayParams
): Effect.Effect<{ readonly id: string; readonly deleted: boolean }, HolidayError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const holiday = yield* findHoliday(client, params.holidayId)
    yield* client.removeDoc(hr.class.PublicHoliday, core.space.Workspace, holiday._id)
    return { id: NonEmptyString.make(holiday._id), deleted: true }
  })
