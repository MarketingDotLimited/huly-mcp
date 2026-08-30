import type { Request, RequestType, Staff } from "@hcengineering/hr"
import { SortingOrder, type AttachedData, type DocumentUpdate } from "@hcengineering/core"
import { Clock, Effect } from "effect"

import {
  type CreateHrRequestParams,
  type DeleteHrRequestParams,
  type GetHrRequestParams,
  type HrRequestSummary,
  type ListHrRequestsParams,
  type UpdateHrRequestParams
} from "../../domain/schemas/hr-requests.js"
import { NonEmptyString } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { type HulyDataInvalidError, HulyError } from "../errors.js"
import { core, hr } from "../huly-plugins.js"
import { ensureDateOrder, formatTzDate, makeTzDate } from "./hr-dates.js"
import { loadDepartmentGraph, resolveDepartment, resolveEmployee, type HrResolutionError } from "./hr-shared.js"
import { markdownToMarkupString, markupToMarkdownString } from "./markup.js"
import { clampLimit, hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

type RequestError = HulyClientError | HulyDataInvalidError | HulyError | HrResolutionError

const typeAliases = new Map<string, string>([
  ["vacation", hr.ids.Vacation],
  ["sick", hr.ids.Sick],
  ["pto", hr.ids.PTO],
  ["pto2", hr.ids.PTO2],
  ["remote", hr.ids.Remote],
  ["overtime", hr.ids.Overtime],
  ["overtime2", hr.ids.Overtime2]
])

const requestTypes = (client: HulyClient["Service"]): Effect.Effect<Array<RequestType>, HulyClientError> =>
  client.findAllInModel<RequestType>(hr.class.RequestType, {}).pipe(Effect.map((types) => Array.from(types)))

const resolveRequestType = (
  client: HulyClient["Service"],
  identifier: string
): Effect.Effect<RequestType, RequestError> =>
  Effect.gen(function* () {
    const types = yield* requestTypes(client)
    const expectedId = typeAliases.get(identifier.toLowerCase()) ?? identifier
    const matches = types.filter((type) => type._id === expectedId || String(type.label) === identifier)
    const match = matches[0]
    if (matches.length === 1 && match !== undefined) return match
    if (matches.length > 1) return yield* new HulyError({ message: `HR request type '${identifier}' is ambiguous` })
    return yield* new HulyError({ message: `HR request type '${identifier}' not found` })
  })

const findRequest = (client: HulyClient["Service"], requestId: string): Effect.Effect<Request, RequestError> =>
  client
    .findOne<Request>(hr.class.Request, hulyQuery<Request>({ _id: toRef<Request>(requestId) }))
    .pipe(
      Effect.flatMap((request) =>
        request === undefined
          ? Effect.fail(new HulyError({ message: `HR request '${requestId}' not found` }))
          : Effect.succeed(request)
      )
    )

const requestSummary = (
  client: HulyClient["Service"],
  request: Request
): Effect.Effect<HrRequestSummary, RequestError> =>
  markupToMarkdownString(request.description, client.markupUrlConfig, {
    operation: "read HR request description",
    entity: request._id
  }).pipe(
    Effect.map((description) => ({
      id: NonEmptyString.make(request._id),
      employeeId: NonEmptyString.make(request.attachedTo),
      departmentId: NonEmptyString.make(request.department),
      typeId: NonEmptyString.make(request.type),
      startDate: formatTzDate(request.tzDate),
      endDate: formatTzDate(request.tzDueDate),
      description,
      modifiedOn: request.modifiedOn
    }))
  )

const requestUpdates = (
  client: HulyClient["Service"],
  current: Request,
  params: UpdateHrRequestParams
): Effect.Effect<DocumentUpdate<Request>, RequestError> =>
  Effect.gen(function* () {
    const operations: DocumentUpdate<Request> = {}
    if (params.type !== undefined) {
      const type = yield* resolveRequestType(client, params.type)
      if (type._id !== current.type) operations.type = type._id
    }
    if (params.startDate !== undefined) operations.tzDate = yield* makeTzDate(params.startDate, params.timezone)
    if (params.endDate !== undefined) operations.tzDueDate = yield* makeTzDate(params.endDate, params.timezone)
    if (params.description !== undefined) {
      operations.description = markdownToMarkupString(params.description, client.markupUrlConfig)
    }
    return operations
  })

export const listHrRequestTypes = (): Effect.Effect<
  {
    readonly types: ReadonlyArray<{
      readonly id: string
      readonly label: string
      readonly value: number
      readonly color: number
    }>
  },
  RequestError,
  HulyClient
> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const types = (yield* requestTypes(client)).map((type) => ({
      id: NonEmptyString.make(type._id),
      label: NonEmptyString.make(String(type.label)),
      value: type.value,
      color: type.color
    }))
    return { types }
  })

export const listHrRequests = (
  params: ListHrRequestsParams
): Effect.Effect<{ readonly requests: ReadonlyArray<HrRequestSummary> }, RequestError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const employee = params.employee === undefined ? undefined : yield* resolveEmployee(client, params.employee, false)
    const department =
      params.department === undefined
        ? undefined
        : yield* resolveDepartment(yield* loadDepartmentGraph(client), params.department)
    const requests = yield* client.findAll<Request>(
      hr.class.Request,
      hulyQuery<Request>({
        ...(employee === undefined ? {} : { attachedTo: toRef<Staff>(employee._id) }),
        ...(department === undefined ? {} : { department: department._id })
      }),
      { limit: clampLimit(params.limit), sort: { modifiedOn: SortingOrder.Descending } }
    )
    const filtered = requests.filter((request) => {
      const start = formatTzDate(request.tzDate)
      const end = formatTzDate(request.tzDueDate)
      return (
        (params.startDate === undefined || end >= params.startDate) &&
        (params.endDate === undefined || start <= params.endDate)
      )
    })
    return { requests: yield* Effect.forEach(filtered, (request) => requestSummary(client, request)) }
  })

export const getHrRequest = (params: GetHrRequestParams): Effect.Effect<HrRequestSummary, RequestError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    return yield* requestSummary(client, yield* findRequest(client, params.requestId))
  })

export const createHrRequest = (
  params: CreateHrRequestParams
): Effect.Effect<{ readonly request: HrRequestSummary; readonly changed: boolean }, RequestError, HulyClient> =>
  Effect.gen(function* () {
    yield* ensureDateOrder(params.startDate, params.endDate)
    const client = yield* HulyClient
    const employee = yield* resolveEmployee(client, params.employee)
    const staff = yield* client.findOne<Staff>(hr.mixin.Staff, hulyQuery<Staff>({ _id: toRef<Staff>(employee._id) }))
    if (staff === undefined)
      return yield* new HulyError({ message: `Employee '${params.employee}' has no HR department` })
    const type = yield* resolveRequestType(client, params.type)
    const tzDate = yield* makeTzDate(params.startDate, params.timezone)
    const tzDueDate = yield* makeTzDate(params.endDate, params.timezone)
    const description = markdownToMarkupString(params.description ?? "", client.markupUrlConfig)
    const attributes: AttachedData<Request> = {
      type: type._id,
      tzDate,
      tzDueDate,
      description,
      department: staff.department
    }
    const id = yield* client.addCollection(
      hr.class.Request,
      core.space.Workspace,
      staff._id,
      staff._class,
      "requests",
      attributes
    )
    return {
      changed: true,
      request: {
        id: NonEmptyString.make(id),
        employeeId: NonEmptyString.make(staff._id),
        departmentId: NonEmptyString.make(staff.department),
        typeId: NonEmptyString.make(type._id),
        startDate: params.startDate,
        endDate: params.endDate,
        description: params.description ?? "",
        modifiedOn: yield* Clock.currentTimeMillis
      }
    }
  })

export const updateHrRequest = (
  params: UpdateHrRequestParams
): Effect.Effect<{ readonly request: HrRequestSummary; readonly changed: boolean }, RequestError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const current = yield* findRequest(client, params.requestId)
    const startDate = params.startDate ?? formatTzDate(current.tzDate)
    const endDate = params.endDate ?? formatTzDate(current.tzDueDate)
    yield* ensureDateOrder(startDate, endDate)
    const operations = yield* requestUpdates(client, current, params)
    const changed = Object.keys(operations).length > 0
    if (changed) yield* client.updateDoc(hr.class.Request, core.space.Workspace, current._id, operations)
    return yield* requestSummary(client, {
      ...current,
      ...operations,
      modifiedOn: changed ? yield* Clock.currentTimeMillis : current.modifiedOn
    }).pipe(Effect.map((request) => ({ request, changed })))
  })

export const deleteHrRequest = (
  params: DeleteHrRequestParams
): Effect.Effect<{ readonly id: string; readonly deleted: boolean }, RequestError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const request = yield* findRequest(client, params.requestId)
    yield* client.removeDoc(hr.class.Request, core.space.Workspace, request._id)
    return { id: NonEmptyString.make(request._id), deleted: true }
  })
