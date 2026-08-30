import type { Employee, Person } from "@hcengineering/contact"
import type { Department, Staff } from "@hcengineering/hr"
import { SortingOrder, type Ref } from "@hcengineering/core"
import { Effect } from "effect"

import {
  type ListStaffParams,
  type ListStaffResult,
  type SetEmployeeDepartmentParams,
  type SetEmployeePositionParams,
  type StaffMutationResult
} from "../../domain/schemas/hr-staff.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { HulyError } from "../errors.js"
import { contact, core, hr } from "../huly-plugins.js"
import {
  aggregateMembersByDepartment,
  aggregateMembersFor,
  loadDepartmentGraph,
  loadStaff,
  resolveDepartment,
  resolveEmployee,
  summarizeStaff,
  type HrResolutionError
} from "./hr-shared.js"
import { clampLimit, hulyQuery } from "./query-helpers.js"
import { toClassRef, toMixinRef, toRef } from "./sdk-boundary.js"

type StaffError = HulyClientError | HulyError | HrResolutionError

const sameMembers = (left: ReadonlyArray<Ref<Employee>>, right: ReadonlyArray<Ref<Employee>>): boolean =>
  left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index])

export const listStaff = (params: ListStaffParams): Effect.Effect<ListStaffResult, StaffError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const graph = yield* loadDepartmentGraph(client)
    const department = params.department === undefined ? undefined : yield* resolveDepartment(graph, params.department)
    const assignments = new Map((yield* loadStaff(client)).map((item) => [String(item._id), item.department]))
    const employees = yield* client.findAll<Employee>(
      contact.mixin.Employee,
      params.includeInactive === true ? {} : hulyQuery<Employee>({ active: true }),
      { limit: clampLimit(params.limit), sort: { name: SortingOrder.Ascending } }
    )
    const selected = employees
      .filter((employee) => department === undefined || assignments.get(String(employee._id)) === department._id)
      .map((employee) => {
        const assignedDepartment = assignments.get(String(employee._id))
        return { employee, ...(assignedDepartment === undefined ? {} : { department: assignedDepartment }) }
      })
    return { staff: yield* summarizeStaff(client, selected) }
  })

const writeAggregateMembers = (
  client: HulyClient["Service"],
  departments: ReadonlyArray<Department>,
  expected: ReadonlyMap<Ref<Department>, Array<Ref<Employee>>>
): Effect.Effect<void, HulyClientError> =>
  Effect.forEach(
    departments.filter((department) => !sameMembers(department.members, aggregateMembersFor(expected, department._id))),
    (department) =>
      client.updateDoc(hr.class.Department, core.space.Workspace, department._id, {
        members: aggregateMembersFor(expected, department._id)
      }),
    { concurrency: 1, discard: true }
  )

export const setEmployeeDepartment = (
  params: SetEmployeeDepartmentParams
): Effect.Effect<StaffMutationResult, StaffError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const graph = yield* loadDepartmentGraph(client)
    const department = yield* resolveDepartment(graph, params.department)
    const employee = yield* resolveEmployee(client, params.employee)
    const current = yield* client.findOne<Staff>(hr.mixin.Staff, hulyQuery<Staff>({ _id: toRef<Staff>(employee._id) }))
    const changed = current?.department !== department._id
    if (changed) {
      if (current === undefined) {
        yield* client.createMixin<Employee, Staff>(employee._id, employee._class, employee.space, hr.mixin.Staff, {
          department: department._id
        })
      } else {
        yield* client.updateMixin<Employee, Staff>(employee._id, employee._class, employee.space, hr.mixin.Staff, {
          department: department._id
        })
      }

      const staff = yield* loadStaff(client)
      const adjusted = [
        ...staff
          .filter((item) => String(item._id) !== String(employee._id))
          .map((item) => ({ employeeId: item._id, department: item.department })),
        { employeeId: employee._id, department: department._id }
      ]
      yield* writeAggregateMembers(client, graph.departments, aggregateMembersByDepartment(graph, adjusted))
    }
    const summaries = yield* summarizeStaff(client, [{ employee, department: department._id }])
    const summary = summaries[0]
    /* v8 ignore start -- summarizeStaff preserves the cardinality of its one-element input */
    if (summary === undefined) return yield* new HulyError({ message: "Failed to summarize updated staff member" })
    /* v8 ignore stop */
    return { staff: summary, changed }
  })

export const setEmployeePosition = (
  params: SetEmployeePositionParams
): Effect.Effect<StaffMutationResult, StaffError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const employee = yield* resolveEmployee(client, params.employee)
    const normalizedPosition = params.position === null || params.position.trim() === "" ? null : params.position.trim()
    const changed = (employee.position ?? null) !== normalizedPosition
    if (changed) {
      yield* client.updateMixin<Person, Employee>(
        employee._id,
        toClassRef<Person>(employee._class),
        employee.space,
        toMixinRef<Employee>(contact.mixin.Employee),
        { position: normalizedPosition }
      )
    }
    const currentStaff = yield* client.findOne<Staff>(
      hr.mixin.Staff,
      hulyQuery<Staff>({ _id: toRef<Staff>(employee._id) })
    )
    const updated: Employee = { ...employee, position: normalizedPosition }
    const summaries = yield* summarizeStaff(client, [
      currentStaff === undefined ? { employee: updated } : { employee: updated, department: currentStaff.department }
    ])
    const summary = summaries[0]
    /* v8 ignore start -- summarizeStaff preserves the cardinality of its one-element input */
    if (summary === undefined) return yield* new HulyError({ message: "Failed to summarize updated employee" })
    /* v8 ignore stop */
    return { staff: summary, changed }
  })
