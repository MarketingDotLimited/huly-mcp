import type { Department } from "@hcengineering/hr"
import type { Employee } from "@hcengineering/contact"
import { type Data, type Doc, type DocumentUpdate, type Ref } from "@hcengineering/core"
import { Clock, Effect } from "effect"

import {
  type CreateDepartmentParams,
  type DeleteDepartmentParams,
  type DeleteDepartmentResult,
  type DepartmentMutationResult,
  type GetDepartmentParams,
  type ListDepartmentsParams,
  type ListDepartmentsResult,
  type ReconcileDepartmentMembersParams,
  type ReconcileDepartmentMembersResult,
  type UpdateDepartmentParams
} from "../../domain/schemas/hr-departments.js"
import { NonEmptyString } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { HulyError } from "../errors.js"
import { core, hr } from "../huly-plugins.js"
import {
  aggregateMembersByDepartment,
  aggregateMembersFor,
  departmentPath,
  departmentSummary,
  directMembersByDepartment,
  ensureNoDepartmentCycle,
  loadDepartmentGraph,
  loadStaff,
  resolveDepartment,
  resolveEmployee,
  resolveEmployeeIds,
  type DepartmentGraph,
  type HrResolutionError
} from "./hr-shared.js"

type DepartmentError = HulyClientError | HulyError | HrResolutionError

const sameRefs = <T extends Doc>(left: ReadonlyArray<Ref<T>>, right: ReadonlyArray<Ref<T>>): boolean =>
  left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index])

const uniqueSiblingName = (
  departments: ReadonlyArray<Department>,
  name: string,
  parent: Ref<Department>,
  except?: Ref<Department>
): Effect.Effect<void, HulyError> => {
  const conflict = departments.find(
    (candidate) =>
      candidate._id !== except && candidate.name.trim() === name.trim() && (candidate.parent ?? hr.ids.Head) === parent
  )
  return conflict === undefined
    ? Effect.void
    : Effect.fail(new HulyError({ message: `Department '${name}' already exists under the selected parent` }))
}

const resolveCreateParent = (
  graph: DepartmentGraph,
  identifier: CreateDepartmentParams["parent"]
): Effect.Effect<Department, HulyError | HrResolutionError> =>
  Effect.gen(function* () {
    const parent = identifier === undefined ? graph.byId.get(hr.ids.Head) : yield* resolveDepartment(graph, identifier)
    if (parent === undefined) return yield* new HulyError({ message: "Huly HR root department is missing" })
    return parent
  })

const resolveCreateTeamLead = (
  client: HulyClient["Service"],
  identifier: CreateDepartmentParams["teamLead"]
): Effect.Effect<Ref<Employee> | null, HrResolutionError> =>
  identifier == null
    ? Effect.succeed(null)
    : resolveEmployee(client, identifier).pipe(Effect.map((employee) => employee._id))

const resolveCreateManagers = (
  client: HulyClient["Service"],
  identifiers: CreateDepartmentParams["managers"]
): Effect.Effect<Array<Ref<Employee>>, HrResolutionError> =>
  identifiers === undefined ? Effect.succeed([]) : resolveEmployeeIds(client, identifiers)

const hasSameDepartmentConfiguration = (left: Department, right: Data<Department>): boolean =>
  left.description === right.description && left.teamLead === right.teamLead && sameRefs(left.managers, right.managers)

const resolveUpdatedParent = (
  graph: DepartmentGraph,
  department: Department,
  identifier: UpdateDepartmentParams["parent"]
): Effect.Effect<Ref<Department> | undefined, HulyError | HrResolutionError> =>
  Effect.gen(function* () {
    if (department._id === hr.ids.Head && identifier !== undefined) {
      return yield* new HulyError({ message: "The Organization root department cannot be re-parented" })
    }
    const parent = identifier === undefined ? department.parent : (yield* resolveDepartment(graph, identifier))._id
    if (parent !== undefined) yield* ensureNoDepartmentCycle(graph, department._id, parent)
    return parent
  })

const resolveUpdatedTeamLead = (
  client: HulyClient["Service"],
  department: Department,
  identifier: UpdateDepartmentParams["teamLead"]
): Effect.Effect<Ref<Employee> | null, HrResolutionError> => {
  if (identifier === undefined) return Effect.succeed(department.teamLead)
  return identifier === null
    ? Effect.succeed(null)
    : resolveEmployee(client, identifier).pipe(Effect.map((employee) => employee._id))
}

const assignParentUpdate = (
  operations: DocumentUpdate<Department>,
  parent: Ref<Department> | undefined,
  current: Ref<Department> | undefined
): void => {
  if (parent !== current && parent !== undefined) operations.parent = parent
}

const departmentUpdates = (
  params: UpdateDepartmentParams,
  department: Department,
  parent: Ref<Department> | undefined,
  teamLead: Ref<Employee> | null,
  managers: Array<Ref<Employee>>
): DocumentUpdate<Department> => {
  const operations: DocumentUpdate<Department> = {}
  if (params.name !== undefined && params.name !== department.name) operations.name = params.name
  if (params.description !== undefined && params.description !== department.description) {
    operations.description = params.description
  }
  assignParentUpdate(operations, parent, department.parent)
  if (teamLead !== department.teamLead) operations.teamLead = teamLead
  if (!sameRefs(managers, department.managers)) operations.managers = managers
  return operations
}

export const listDepartments = (
  params: ListDepartmentsParams
): Effect.Effect<ListDepartmentsResult, DepartmentError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const graph = yield* loadDepartmentGraph(client)
    const direct = directMembersByDepartment(yield* loadStaff(client))
    const departments = graph.departments
      .filter((department) => params.includeRoot === true || department._id !== hr.ids.Head)
      .map((department) => departmentSummary(department, graph, direct))
      .sort((left, right) => left.path.localeCompare(right.path))
    return { departments }
  })

export const getDepartment = (
  params: GetDepartmentParams
): Effect.Effect<DepartmentMutationResult["department"], DepartmentError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const graph = yield* loadDepartmentGraph(client)
    const department = yield* resolveDepartment(graph, params.department)
    return departmentSummary(department, graph, directMembersByDepartment(yield* loadStaff(client)))
  })

export const createDepartment = (
  params: CreateDepartmentParams
): Effect.Effect<DepartmentMutationResult, DepartmentError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const graph = yield* loadDepartmentGraph(client)
    const parent = yield* resolveCreateParent(graph, params.parent)
    const teamLead = yield* resolveCreateTeamLead(client, params.teamLead)
    const managers = yield* resolveCreateManagers(client, params.managers)
    const attributes: Data<Department> = {
      name: params.name,
      description: params.description ?? "",
      parent: parent._id,
      members: [],
      teamLead,
      managers
    }
    const existing = graph.departments.find(
      (candidate) => candidate.name.trim() === params.name && (candidate.parent ?? hr.ids.Head) === parent._id
    )
    if (existing !== undefined) {
      if (hasSameDepartmentConfiguration(existing, attributes)) {
        return {
          changed: false,
          department: departmentSummary(existing, graph, directMembersByDepartment(yield* loadStaff(client)))
        }
      }
      return yield* new HulyError({
        message: `Department '${params.name}' already exists under the selected parent with different configuration`
      })
    }
    const id = yield* client.createDoc(hr.class.Department, core.space.Workspace, attributes)
    const modifiedOn = yield* Clock.currentTimeMillis
    return {
      changed: true,
      department: {
        id: NonEmptyString.make(id),
        name: params.name,
        description: attributes.description,
        parentId: NonEmptyString.make(parent._id),
        path: NonEmptyString.make(`${departmentPath(parent, graph)}/${params.name}`),
        teamLeadId: teamLead === null ? null : NonEmptyString.make(teamLead),
        managerIds: managers.map((manager) => NonEmptyString.make(manager)),
        memberIds: [],
        directMemberIds: [],
        modifiedOn
      }
    }
  })

export const updateDepartment = (
  params: UpdateDepartmentParams
): Effect.Effect<DepartmentMutationResult, DepartmentError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const graph = yield* loadDepartmentGraph(client)
    const department = yield* resolveDepartment(graph, params.department)
    const parent = yield* resolveUpdatedParent(graph, department, params.parent)
    yield* uniqueSiblingName(
      graph.departments,
      params.name ?? department.name.trim(),
      parent ?? hr.ids.Head,
      department._id
    )

    const teamLead = yield* resolveUpdatedTeamLead(client, department, params.teamLead)
    const managers =
      params.managers === undefined ? department.managers : yield* resolveEmployeeIds(client, params.managers)
    const operations = departmentUpdates(params, department, parent, teamLead, managers)
    const changed = Object.keys(operations).length > 0
    if (changed) yield* client.updateDoc(hr.class.Department, core.space.Workspace, department._id, operations)

    const next: Department = {
      ...department,
      ...operations,
      modifiedOn: changed ? yield* Clock.currentTimeMillis : department.modifiedOn
    }
    const nextGraph = {
      departments: graph.departments.map((item) => (item._id === next._id ? next : item)),
      byId: new Map(graph.departments.map((item) => [item._id, item._id === next._id ? next : item]))
    }
    return {
      department: departmentSummary(next, nextGraph, directMembersByDepartment(yield* loadStaff(client))),
      changed
    }
  })

export const deleteDepartment = (
  params: DeleteDepartmentParams
): Effect.Effect<DeleteDepartmentResult, DepartmentError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const graph = yield* loadDepartmentGraph(client)
    const department = yield* resolveDepartment(graph, params.department)
    if (department._id === hr.ids.Head)
      return yield* new HulyError({ message: "The Organization root cannot be deleted" })
    if (graph.departments.some((candidate) => candidate.parent === department._id)) {
      return yield* new HulyError({ message: "Department has child departments and cannot be deleted" })
    }
    if (department.members.length > 0) {
      return yield* new HulyError({ message: "Department has members and cannot be deleted" })
    }
    yield* client.removeDoc(hr.class.Department, core.space.Workspace, department._id)
    return { id: NonEmptyString.make(department._id), deleted: true }
  })

export const reconcileDepartmentMembers = (
  params: ReconcileDepartmentMembersParams
): Effect.Effect<ReconcileDepartmentMembersResult, DepartmentError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const graph = yield* loadDepartmentGraph(client)
    const expected = aggregateMembersByDepartment(
      graph,
      (yield* loadStaff(client)).map((employee) => ({ employeeId: employee._id, department: employee.department }))
    )
    const changed = graph.departments.filter(
      (department) => !sameRefs(department.members, aggregateMembersFor(expected, department._id))
    )
    if (params.dryRun !== true) {
      yield* Effect.forEach(
        changed,
        (department) =>
          client.updateDoc(hr.class.Department, core.space.Workspace, department._id, {
            members: aggregateMembersFor(expected, department._id)
          }),
        { concurrency: 1, discard: true }
      )
    }
    return {
      changedDepartmentIds: changed.map((item) => NonEmptyString.make(item._id)),
      dryRun: params.dryRun === true
    }
  })
