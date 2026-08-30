import type { Employee } from "@hcengineering/contact"
import type { Department, Staff } from "@hcengineering/hr"
import type { Ref } from "@hcengineering/core"
import { Effect } from "effect"

import { Count, NonEmptyString, PersonName, type PersonRefInput } from "../../domain/schemas/shared.js"
import type { DepartmentSummary } from "../../domain/schemas/hr-departments.js"
import type { StaffSummary } from "../../domain/schemas/hr-staff.js"
import type { HulyClient, HulyClientError } from "../client.js"
import {
  HulyError,
  type PersonIdentifierAmbiguousError,
  PersonNotAnEmployeeError,
  PersonNotFoundError
} from "../errors.js"
import { contact, hr } from "../huly-plugins.js"
import { batchGetEmailsForPersons, findPersonByIdOrExactEmailOrName } from "./contacts-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

export type HrResolutionError =
  | HulyClientError
  | HulyError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | PersonNotAnEmployeeError

export interface DepartmentGraph {
  readonly departments: ReadonlyArray<Department>
  readonly byId: ReadonlyMap<Ref<Department>, Department>
}

export interface StaffAssignment {
  readonly employeeId: string
  readonly department: Ref<Department>
}

export const loadDepartmentGraph = (client: HulyClient["Service"]): Effect.Effect<DepartmentGraph, HulyClientError> =>
  client
    .findAll<Department>(hr.class.Department, {})
    .pipe(Effect.map((departments) => ({ departments, byId: new Map(departments.map((item) => [item._id, item])) })))

const normalizedPath = (value: string): string =>
  value
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join("/")

const normalizedDepartmentName = (value: string): string => value.trim()

export const departmentPath = (department: Department, graph: DepartmentGraph): string => {
  const names: Array<string> = []
  const visited = new Set<Ref<Department>>()
  let current: Department | undefined = department
  while (current !== undefined && !visited.has(current._id)) {
    visited.add(current._id)
    names.unshift(normalizedDepartmentName(current.name))
    current = current.parent === undefined ? undefined : graph.byId.get(current.parent)
  }
  return names.join("/")
}

export const resolveDepartment = (graph: DepartmentGraph, identifier: string): Effect.Effect<Department, HulyError> => {
  const byId = graph.byId.get(toRef<Department>(identifier))
  if (byId !== undefined) return Effect.succeed(byId)

  const requestedPath = normalizedPath(identifier)
  const byPath = graph.departments.filter(
    (department) => normalizedPath(departmentPath(department, graph)) === requestedPath
  )
  const pathMatch = byPath[0]
  if (byPath.length === 1 && pathMatch !== undefined) return Effect.succeed(pathMatch)
  if (byPath.length > 1) {
    return Effect.fail(new HulyError({ message: `Department path '${identifier}' is ambiguous` }))
  }

  const requestedName = normalizedDepartmentName(identifier)
  const byName = graph.departments.filter((department) => normalizedDepartmentName(department.name) === requestedName)
  const nameMatch = byName[0]
  if (byName.length === 1 && nameMatch !== undefined) return Effect.succeed(nameMatch)
  if (byName.length > 1) {
    return Effect.fail(
      new HulyError({ message: `Department name '${identifier}' is ambiguous; use a hierarchy path or ID` })
    )
  }
  return Effect.fail(new HulyError({ message: `Department '${identifier}' not found` }))
}

export const resolveEmployee = (
  client: HulyClient["Service"],
  identifier: PersonRefInput,
  requireActive = true
): Effect.Effect<Employee, HrResolutionError> =>
  Effect.gen(function* () {
    const person = yield* findPersonByIdOrExactEmailOrName(client, identifier)
    if (person === undefined) return yield* new PersonNotFoundError({ identifier })
    const activeEmployees = yield* client.findAll<Employee>(
      contact.mixin.Employee,
      hulyQuery<Employee>({ _id: toRef<Employee>(person._id), active: true }),
      { limit: 1 }
    )
    const activeEmployee = activeEmployees[0]
    if (activeEmployee !== undefined) return activeEmployee
    const inactiveEmployees = yield* client.findAll<Employee>(
      contact.mixin.Employee,
      hulyQuery<Employee>({ _id: toRef<Employee>(person._id), active: false }),
      { limit: 1 }
    )
    const inactiveEmployee = inactiveEmployees[0]
    if (inactiveEmployee === undefined) return yield* new PersonNotAnEmployeeError({ identifier })
    if (requireActive) {
      return yield* new HulyError({ message: `Employee '${identifier}' is inactive` })
    }
    return inactiveEmployee
  })

export const resolveEmployeeIds = (
  client: HulyClient["Service"],
  identifiers: ReadonlyArray<PersonRefInput>
): Effect.Effect<Array<Ref<Employee>>, HrResolutionError> =>
  Effect.forEach(identifiers, (identifier) => resolveEmployee(client, identifier), { concurrency: 4 }).pipe(
    Effect.map((employees) => [...new Set(employees.map((employee) => employee._id))])
  )

export const loadStaff = (client: HulyClient["Service"]): Effect.Effect<Array<Staff>, HulyClientError> =>
  client.findAll<Staff>(hr.mixin.Staff, {}).pipe(Effect.map((staff) => Array.from(staff)))

export const directMembersByDepartment = (
  staff: ReadonlyArray<Staff>
): ReadonlyMap<Ref<Department>, Array<Ref<Employee>>> => {
  const result = new Map<Ref<Department>, Array<Ref<Employee>>>()
  for (const employee of staff) {
    const current = result.get(employee.department) ?? []
    current.push(toRef<Employee>(employee._id))
    result.set(employee.department, current)
  }
  return result
}

const addEmployeeToDepartmentAncestors = (
  graph: DepartmentGraph,
  result: Map<Ref<Department>, Set<Ref<Employee>>>,
  employee: StaffAssignment
): void => {
  const visited = new Set<Ref<Department>>()
  let current: Ref<Department> | undefined = employee.department
  while (current !== undefined && !visited.has(current)) {
    visited.add(current)
    result.get(current)?.add(toRef<Employee>(employee.employeeId))
    const department = graph.byId.get(current)
    current = department?.parent ?? (department?._id !== hr.ids.Head ? hr.ids.Head : undefined)
  }
}

export const aggregateMembersByDepartment = (
  graph: DepartmentGraph,
  staff: ReadonlyArray<StaffAssignment>
): ReadonlyMap<Ref<Department>, Array<Ref<Employee>>> => {
  const result = new Map(graph.departments.map((department) => [department._id, new Set<Ref<Employee>>()]))
  for (const employee of staff) addEmployeeToDepartmentAncestors(graph, result, employee)
  return new Map([...result].map(([id, members]) => [id, [...members].sort()]))
}

export const aggregateMembersFor = (
  expected: ReadonlyMap<Ref<Department>, Array<Ref<Employee>>>,
  departmentId: Ref<Department>
): Array<Ref<Employee>> => {
  const members = expected.get(departmentId)
  /* v8 ignore start -- aggregateMembersByDepartment initializes an entry for every graph department */
  if (members === undefined) throw new Error(`Department '${departmentId}' is missing from its aggregate map`)
  /* v8 ignore stop */
  return members
}

export const departmentSummary = (
  department: Department,
  graph: DepartmentGraph,
  directMembers: ReadonlyMap<Ref<Department>, Array<Ref<Employee>>>
): DepartmentSummary => ({
  id: NonEmptyString.make(department._id),
  name: NonEmptyString.make(normalizedDepartmentName(department.name)),
  description: department.description,
  ...(department.parent === undefined ? {} : { parentId: NonEmptyString.make(department.parent) }),
  path: NonEmptyString.make(departmentPath(department, graph)),
  teamLeadId: department.teamLead === null ? null : NonEmptyString.make(department.teamLead),
  managerIds: [...department.managers].map((manager) => NonEmptyString.make(manager)),
  memberIds: [...department.members].map((member) => NonEmptyString.make(member)),
  directMemberIds: [...(directMembers.get(department._id) ?? [])].map((member) => NonEmptyString.make(member)),
  modifiedOn: department.modifiedOn
})

export const staffSummary = (employee: Employee, email?: string, department?: Ref<Department>): StaffSummary => {
  const position = employee.position?.trim()
  return {
    employeeId: NonEmptyString.make(employee._id),
    name: PersonName.make(employee.name),
    ...(email === undefined ? {} : { email: NonEmptyString.make(email) }),
    active: employee.active,
    ...(department === undefined ? {} : { departmentId: NonEmptyString.make(department) }),
    ...(position == null || position === "" ? {} : { position })
  }
}

export const summarizeStaff = (
  client: HulyClient["Service"],
  staff: ReadonlyArray<{ readonly employee: Employee; readonly department?: Ref<Department> }>
): Effect.Effect<Array<StaffSummary>, HulyClientError> =>
  Effect.gen(function* () {
    const emails = yield* batchGetEmailsForPersons(
      client,
      staff.map(({ employee }) => employee._id)
    )
    return staff.map(({ department, employee }) => staffSummary(employee, emails.get(employee._id), department))
  })

export const ensureNoDepartmentCycle = (
  graph: DepartmentGraph,
  departmentId: Ref<Department>,
  parentId: Ref<Department>
): Effect.Effect<void, HulyError> => {
  const visited = new Set<Ref<Department>>()
  let current: Ref<Department> | undefined = parentId
  while (current !== undefined && !visited.has(current)) {
    if (current === departmentId) {
      return Effect.fail(new HulyError({ message: "A department cannot be its own ancestor" }))
    }
    visited.add(current)
    current = graph.byId.get(current)?.parent
  }
  return Effect.void
}

export const ambiguousCount = (count: number): Count => Count.make(count)
