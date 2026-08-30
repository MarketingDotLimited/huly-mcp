import type { Employee, Person } from "@hcengineering/contact"
import type { Department, PublicHoliday, Request, RequestType, Staff } from "@hcengineering/hr"
import {
  type Class,
  type Data,
  type Doc,
  type DocumentQuery,
  type DocumentUpdate,
  type FindOptions,
  type Ref,
  type Space,
  toFindResult
} from "@hcengineering/core"
import { Effect, Schema } from "effect"
import { describe, expect, it } from "vitest"

import { HulyClient, type HulyClientOperations } from "../client.js"
import { contact, core, hr } from "../huly-plugins.js"
import {
  ensureDateOrder as ensureDateOrderOperation,
  formatTzDate,
  makeTzDate as makeTzDateOperation
} from "./hr-dates.js"
import {
  createDepartment as createDepartmentOperation,
  deleteDepartment as deleteDepartmentOperation,
  getDepartment as getDepartmentOperation,
  listDepartments as listDepartmentsOperation,
  reconcileDepartmentMembers as reconcileDepartmentMembersOperation,
  updateDepartment as updateDepartmentOperation
} from "./hr-departments.js"
import {
  createPublicHoliday as createPublicHolidayOperation,
  deletePublicHoliday as deletePublicHolidayOperation,
  listPublicHolidays as listPublicHolidaysOperation,
  updatePublicHoliday as updatePublicHolidayOperation
} from "./hr-holidays.js"
import {
  getHrSchedule as getHrScheduleOperation,
  getHrSummaryReport as getHrSummaryReportOperation
} from "./hr-reports.js"
import {
  createHrRequest as createHrRequestOperation,
  deleteHrRequest as deleteHrRequestOperation,
  getHrRequest as getHrRequestOperation,
  listHrRequests as listHrRequestsOperation,
  listHrRequestTypes,
  updateHrRequest as updateHrRequestOperation
} from "./hr-requests.js"
import {
  aggregateMembersByDepartment,
  departmentPath,
  directMembersByDepartment,
  ensureNoDepartmentCycle,
  resolveDepartment,
  staffSummary
} from "./hr-shared.js"
import {
  listStaff as listStaffOperation,
  setEmployeeDepartment as setEmployeeDepartmentOperation,
  setEmployeePosition as setEmployeePositionOperation
} from "./hr-staff.js"

const input = <A>(value: unknown): A => Schema.decodeUnknownSync(Schema.Unknown)(value) as A
const at = <T>(values: ReadonlyArray<T>, index: number): T => {
  const value = values[index]
  if (value === undefined) throw new Error(`Missing fixture at index ${index}`)
  return value
}
const makeTzDate = (value: unknown, timezone?: string) => makeTzDateOperation(input(value), timezone)
const ensureDateOrder = (start: unknown, end: unknown) => ensureDateOrderOperation(input(start), input(end))
const listDepartments = (value: unknown) => listDepartmentsOperation(input(value))
const getDepartment = (value: unknown) => getDepartmentOperation(input(value))
const createDepartment = (value: unknown) => createDepartmentOperation(input(value))
const updateDepartment = (value: unknown) => updateDepartmentOperation(input(value))
const deleteDepartment = (value: unknown) => deleteDepartmentOperation(input(value))
const reconcileDepartmentMembers = (value: unknown) => reconcileDepartmentMembersOperation(input(value))
const listStaff = (value: unknown) => listStaffOperation(input(value))
const setEmployeeDepartment = (value: unknown) => setEmployeeDepartmentOperation(input(value))
const setEmployeePosition = (value: unknown) => setEmployeePositionOperation(input(value))
const listHrRequests = (value: unknown) => listHrRequestsOperation(input(value))
const getHrRequest = (value: unknown) => getHrRequestOperation(input(value))
const createHrRequest = (value: unknown) => createHrRequestOperation(input(value))
const updateHrRequest = (value: unknown) => updateHrRequestOperation(input(value))
const deleteHrRequest = (value: unknown) => deleteHrRequestOperation(input(value))
const listPublicHolidays = (value: unknown) => listPublicHolidaysOperation(input(value))
const createPublicHoliday = (value: unknown) => createPublicHolidayOperation(input(value))
const updatePublicHoliday = (value: unknown) => updatePublicHolidayOperation(input(value))
const deletePublicHoliday = (value: unknown) => deletePublicHolidayOperation(input(value))
const getHrSchedule = (value: unknown) => getHrScheduleOperation(input(value))
const getHrSummaryReport = (value: unknown) => getHrSummaryReportOperation(input(value))

const socialId = "test-social-id"
const base = <T extends Doc>(_id: string, _class: Ref<Class<T>>, space: Ref<Space>) => ({
  _id: _id as Ref<T>,
  _class,
  space,
  modifiedOn: 1,
  modifiedBy: socialId
})

const rootDepartment = (): Department =>
  input({
    ...base(String(hr.ids.Head), hr.class.Department, core.space.Workspace),
    name: "Organization",
    description: "Root",
    members: [],
    managers: [],
    teamLead: null
  })

const department = (id: string, name: string, parent = hr.ids.Head): Department =>
  input({
    ...base(id, hr.class.Department, core.space.Workspace),
    name,
    description: `${name} description`,
    parent,
    members: [],
    managers: [],
    teamLead: null
  })

const person = (id: string, name: string): Person =>
  input({ ...base(id, contact.class.Person, core.space.Workspace), name, city: "" })

const employee = (id: string, name: string, active = true, position?: string): Employee =>
  input({ ...person(id, name), active, ...(position === undefined ? {} : { position }) })

const staff = (employeeId: string, departmentId: Ref<Department>): Staff =>
  input({ ...base(employeeId, contact.class.Person, core.space.Workspace), department: departmentId })

const requestType = (id: string, label: string, value = 1): RequestType =>
  input({ ...base(id, hr.class.RequestType, core.space.Model), label, value, color: 2 })

interface HrState {
  departments: Array<Department>
  employees: Array<Employee>
  persons: Array<Person>
  staff: Array<Staff>
  requests: Array<Request>
  requestTypes: Array<RequestType>
  holidays: Array<PublicHoliday>
  writes: Array<{ readonly kind: string; readonly id: string; readonly value?: unknown }>
}

const initialState = (): HrState => {
  const operations = department("operations", "Operations")
  const content = department("content", "Content", operations._id)
  const alice = employee("alice", "Alice", true, "Writer")
  const bob = employee("bob", "Bob")
  return {
    departments: [rootDepartment(), operations, content],
    employees: [alice, bob, employee("inactive", "Inactive", false)],
    persons: [person("alice", "Alice"), person("bob", "Bob"), person("inactive", "Inactive")],
    staff: [staff("alice", content._id)],
    requests: [],
    requestTypes: [requestType(String(hr.ids.Vacation), "Vacation")],
    holidays: [],
    writes: []
  }
}

const idFromQuery = (query: unknown): string | undefined => {
  if (typeof query !== "object" || query === null) return undefined
  const id = Reflect.get(query, "_id")
  return typeof id === "string" ? id : undefined
}

const nameFromQuery = (query: unknown): string | undefined => {
  if (typeof query !== "object" || query === null) return undefined
  const name = Reflect.get(query, "name")
  return typeof name === "string" ? name : undefined
}

const layerFor = (state: HrState): ReturnType<typeof HulyClient.testLayer> => {
  const docsFor = (classId: unknown): ReadonlyArray<Doc> => {
    if (classId === hr.class.Department) return state.departments
    if (classId === contact.class.Person) return state.persons
    if (classId === contact.mixin.Employee) return state.employees
    if (classId === hr.mixin.Staff) return state.staff
    if (classId === hr.class.Request) return state.requests
    if (classId === hr.class.RequestType) return state.requestTypes
    if (classId === hr.class.PublicHoliday) return state.holidays
    return []
  }
  const findAll: HulyClientOperations["findAll"] = (<T extends Doc>(
    classId: Ref<Class<T>>,
    query: DocumentQuery<T>,
    _options?: FindOptions<T>
  ) => {
    let docs = docsFor(classId)
    const id = idFromQuery(query)
    const name = nameFromQuery(query)
    const ids =
      typeof Reflect.get(query, "_id") === "object" ? Reflect.get(Reflect.get(query, "_id"), "$in") : undefined
    const departmentId = Reflect.get(query, "department")
    const date = Reflect.get(query, "date")
    if (id !== undefined) docs = docs.filter((item) => String(item._id) === id)
    if (name !== undefined) docs = docs.filter((item) => Reflect.get(item, "name") === name)
    if (Array.isArray(ids)) docs = docs.filter((item) => ids.includes(item._id))
    if (typeof departmentId === "string") docs = docs.filter((item) => Reflect.get(item, "department") === departmentId)
    if (typeof date === "object" && date !== null) {
      docs = docs.filter((item) => JSON.stringify(Reflect.get(item, "date")) === JSON.stringify(date))
    }
    return Effect.succeed(toFindResult(Array.from(docs) as Array<T>))
  }) as HulyClientOperations["findAll"]
  const findOne: HulyClientOperations["findOne"] = (<T extends Doc>(classId: Ref<Class<T>>, query: DocumentQuery<T>) =>
    Effect.map(findAll(classId, query), (items) => items[0])) as HulyClientOperations["findOne"]
  const createDoc: HulyClientOperations["createDoc"] = (<T extends Doc>(
    classId: Ref<Class<T>>,
    space: Ref<Space>,
    attributes: Data<T>
  ) => {
    const id = `created-${state.writes.length + 1}` as Ref<T>
    const doc = { ...base(String(id), classId, space), ...attributes }
    if (classId === hr.class.Department) state.departments.push(input(doc))
    if (classId === hr.class.PublicHoliday) state.holidays.push(input(doc))
    state.writes.push({ kind: "create", id: String(id), value: attributes })
    return Effect.succeed(id)
  }) as HulyClientOperations["createDoc"]
  const updateDoc: HulyClientOperations["updateDoc"] = (<T extends Doc>(
    classId: Ref<Class<T>>,
    _space: Ref<Space>,
    objectId: Ref<T>,
    operations: DocumentUpdate<T>
  ) => {
    const docs = docsFor(classId) as Array<Doc>
    const index = docs.findIndex((item) => item._id === objectId)
    if (index >= 0) docs[index] = input({ ...docs[index], ...operations })
    state.writes.push({ kind: "update", id: String(objectId), value: operations })
    return Effect.succeed({})
  }) as HulyClientOperations["updateDoc"]
  const removeDoc: HulyClientOperations["removeDoc"] = (<T extends Doc>(
    classId: Ref<Class<T>>,
    _space: Ref<Space>,
    objectId: Ref<T>
  ) => {
    const docs = docsFor(classId) as Array<Doc>
    const index = docs.findIndex((item) => item._id === objectId)
    if (index >= 0) docs.splice(index, 1)
    state.writes.push({ kind: "remove", id: String(objectId) })
    return Effect.succeed({})
  }) as HulyClientOperations["removeDoc"]
  const createMixin = input<HulyClientOperations["createMixin"]>(
    (objectId: string, ...args: ReadonlyArray<unknown>) => {
      const attributes = args.at(-1) as { readonly department: Ref<Department> }
      state.staff.push(staff(objectId, attributes.department))
      state.writes.push({ kind: "createMixin", id: objectId, value: attributes })
      return Effect.succeed(undefined)
    }
  )
  const updateMixin = input<HulyClientOperations["updateMixin"]>(
    (objectId: string, ...args: ReadonlyArray<unknown>) => {
      const attributes = args.at(-1) as Readonly<Record<string, unknown>>
      const assignment = state.staff.find((item) => item._id === objectId)
      const currentEmployee = state.employees.find((item) => item._id === objectId)
      if (assignment !== undefined && typeof attributes["department"] === "string") {
        assignment.department = attributes["department"] as Ref<Department>
      }
      if (currentEmployee !== undefined && "position" in attributes) {
        currentEmployee.position = attributes["position"] as string | null
      }
      state.writes.push({ kind: "updateMixin", id: objectId, value: attributes })
      return Effect.succeed(undefined)
    }
  )
  const addCollection = input<HulyClientOperations["addCollection"]>(
    (
      _class: unknown,
      _space: unknown,
      attachedTo: Ref<Staff>,
      attachedToClass: Ref<Class<Staff>>,
      _collection: string,
      attributes: Omit<Request, keyof Doc | "attachedTo" | "attachedToClass" | "collection">
    ) => {
      const id = `request-${state.requests.length + 1}` as Ref<Request>
      state.requests.push(
        input({
          ...base(String(id), hr.class.Request, core.space.Workspace),
          ...attributes,
          attachedTo,
          attachedToClass,
          collection: "requests"
        })
      )
      state.writes.push({ kind: "addCollection", id: String(id), value: attributes })
      return Effect.succeed(id)
    }
  )
  return HulyClient.testLayer({
    findAll,
    findAllInModel: findAll,
    findOne,
    createDoc,
    updateDoc,
    removeDoc,
    createMixin,
    updateMixin,
    addCollection
  })
}

const run = <A, E>(effect: Effect.Effect<A, E, HulyClient>, state: HrState) =>
  Effect.runPromise(effect.pipe(Effect.provide(layerFor(state))))

const runFailure = <A, E>(effect: Effect.Effect<A, E, HulyClient>, state: HrState) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(layerFor(state))))

describe("HR date operations", () => {
  it("round-trips valid UTC and IANA dates and validates ranges", async () => {
    const utc = await Effect.runPromise(makeTzDate("2026-08-31"))
    const berlin = await Effect.runPromise(makeTzDate("2026-08-31", "Europe/Berlin"))
    expect(formatTzDate(utc)).toBe("2026-08-31")
    expect(berlin.offset).toBe(-120)
    await expect(Effect.runPromise(ensureDateOrder("2026-08-30", "2026-08-31"))).resolves.toBeUndefined()
  })

  it("rejects malformed dates, impossible dates, zones, and reversed ranges", async () => {
    await expect(Effect.runPromise(makeTzDate("2026-8-31" as never))).rejects.toThrow("Invalid date")
    await expect(Effect.runPromise(makeTzDate("2026-02-30"))).rejects.toThrow("Invalid date")
    await expect(Effect.runPromise(makeTzDate("2026-08-31", "No/Such_Zone"))).rejects.toThrow("Invalid date")
    await expect(Effect.runPromise(ensureDateOrder("2026-09-01", "2026-08-31"))).rejects.toThrow("must not")
  })
})

describe("HR departments and staff", () => {
  it("lists, resolves, summarizes, and aggregates a hierarchy", async () => {
    const state = initialState()
    at(state.departments, 1).name = "Operations "
    at(state.departments, 1).members = ["alice" as Ref<Employee>]
    const listed = await run(listDepartments({ includeRoot: false }), state)
    expect(listed.departments.map((item) => item.path)).toEqual([
      "Organization/Operations",
      "Organization/Operations/Content"
    ])
    expect(
      (await run(getDepartment({ department: "Organization/Operations/Content" }), state)).directMemberIds
    ).toEqual(["alice"])
    const graph = { departments: state.departments, byId: new Map(state.departments.map((item) => [item._id, item])) }
    expect(departmentPath(at(state.departments, 2), graph)).toBe("Organization/Operations/Content")
    expect((await run(getDepartment({ department: "Operations" }), state)).name).toBe("Operations")
    expect(directMembersByDepartment(state.staff).get("content" as Ref<Department>)).toEqual(["alice"])
    expect(
      aggregateMembersByDepartment(graph, [{ employeeId: "alice", department: "content" as Ref<Department> }]).get(
        hr.ids.Head
      )
    ).toEqual(["alice"])
    expect(staffSummary(at(state.employees, 0), "alice@example.com", "content" as Ref<Department>)).toMatchObject({
      email: "alice@example.com"
    })
    const root = (await run(listDepartments({ includeRoot: true }), state)).departments[0]
    expect(root).toMatchObject({ name: "Organization" })
    expect(root?.parentId).toBeUndefined()
    const bobSummary = staffSummary(at(state.employees, 1))
    expect(bobSummary.employeeId).toBe("bob")
    expect(bobSummary.position).toBeUndefined()
    expect(staffSummary(employee("trimmed", "Trimmed", true, " Director ")).position).toBe("Director")
    expect(staffSummary(employee("empty-position", "Empty", true, " ")).position).toBeUndefined()
    expect(
      aggregateMembersByDepartment(graph, [{ employeeId: "orphan", department: "unknown" as Ref<Department> }]).get(
        hr.ids.Head
      )
    ).toEqual(["orphan"])
    expect(
      directMembersByDepartment([...state.staff, staff("bob", "content" as Ref<Department>)]).get(
        "content" as Ref<Department>
      )
    ).toEqual(["alice", "bob"])
  })

  it("creates, updates, re-parents, reconciles, and deletes departments", async () => {
    const state = initialState()
    const created = await run(
      createDepartment({ name: "Creative", parent: "Operations", managers: ["alice"], teamLead: "bob" }),
      state
    )
    expect(created).toMatchObject({
      changed: true,
      department: { path: "Organization/Operations/Creative", managerIds: ["alice"], teamLeadId: "bob" }
    })
    const bare = await run(createDepartment({ name: "Bare" }), state)
    expect(bare.department).toMatchObject({ teamLeadId: null, managerIds: [] })
    expect((await run(createDepartment({ name: "Bare" }), state)).changed).toBe(false)
    const updated = await run(
      updateDepartment({
        department: created.department.id,
        name: "Studio",
        description: "Design",
        parent: "Organization",
        managers: [],
        teamLead: null
      }),
      state
    )
    expect(updated).toMatchObject({
      changed: true,
      department: { path: "Organization/Studio", managerIds: [], teamLeadId: null }
    })
    expect((await run(updateDepartment({ department: created.department.id }), state)).changed).toBe(false)
    expect((await run(updateDepartment({ department: created.department.id, teamLead: "alice" }), state)).changed).toBe(
      true
    )
    expect(
      (await run(updateDepartment({ department: String(hr.ids.Head), description: "Updated root" }), state)).changed
    ).toBe(true)
    expect((await run(reconcileDepartmentMembers({ dryRun: true }), state)).dryRun).toBe(true)
    await run(reconcileDepartmentMembers({ dryRun: false }), state)
    expect((await run(deleteDepartment({ department: created.department.id }), state)).deleted).toBe(true)
  })

  it("rejects duplicate, missing-root, cyclic, nonempty, and root mutations", async () => {
    const duplicate = initialState()
    await expect(run(createDepartment({ name: "Operations" }), duplicate)).rejects.toThrow("already exists")
    await expect(run(createDepartment({ name: "Organization" }), initialState())).rejects.toThrow("already exists")
    const missingRoot = initialState()
    missingRoot.departments.shift()
    await expect(run(createDepartment({ name: "New" }), missingRoot)).rejects.toThrow("root department is missing")
    await expect(
      run(updateDepartment({ department: "Operations", parent: "Content" }), initialState())
    ).rejects.toThrow("own ancestor")
    const siblingConflict = initialState()
    siblingConflict.departments.push(department("other-content", "Other", "operations" as Ref<Department>))
    await expect(run(updateDepartment({ department: "Content", name: "Other" }), siblingConflict)).rejects.toThrow(
      "already exists"
    )
    await expect(
      run(updateDepartment({ department: String(hr.ids.Head), parent: "Operations" }), initialState())
    ).rejects.toThrow("cannot be re-parented")
    await expect(run(deleteDepartment({ department: String(hr.ids.Head) }), initialState())).rejects.toThrow(
      "cannot be deleted"
    )
    await expect(run(deleteDepartment({ department: "Operations" }), initialState())).rejects.toThrow(
      "child departments"
    )
    const nonempty = initialState()
    at(nonempty.departments, 2).members = ["alice" as Ref<Employee>]
    await expect(run(deleteDepartment({ department: "Content" }), nonempty)).rejects.toThrow("has members")
    const graph = {
      departments: duplicate.departments,
      byId: new Map(duplicate.departments.map((item) => [item._id, item]))
    }
    await expect(Effect.runPromise(resolveDepartment(graph, "Missing"))).rejects.toThrow("not found")
    const ambiguous = department("content-duplicate", "Content", "operations" as Ref<Department>)
    const ambiguousGraph = {
      departments: [...duplicate.departments, ambiguous],
      byId: new Map([...duplicate.departments, ambiguous].map((item) => [item._id, item]))
    }
    await expect(Effect.runPromise(resolveDepartment(ambiguousGraph, "Content"))).rejects.toThrow("ambiguous")
    await expect(
      Effect.runPromise(resolveDepartment(ambiguousGraph, "Organization/Operations/Content"))
    ).rejects.toThrow("ambiguous")
    await expect(
      Effect.runPromise(
        ensureNoDepartmentCycle(graph, "operations" as Ref<Department>, "operations" as Ref<Department>)
      )
    ).rejects.toThrow("own ancestor")
  })

  it("lists staff and idempotently changes departments and positions", async () => {
    const state = initialState()
    expect(
      (await run(listStaff({ department: "Content", includeInactive: false, limit: 10 }), state)).staff
    ).toHaveLength(1)
    expect((await run(setEmployeeDepartment({ employee: "alice", department: "Content" }), state)).changed).toBe(false)
    expect((await run(setEmployeeDepartment({ employee: "bob", department: "Content" }), state)).changed).toBe(true)
    expect((await run(setEmployeeDepartment({ employee: "alice", department: "Operations" }), state)).changed).toBe(
      true
    )
    expect((await run(setEmployeePosition({ employee: "alice", position: " Writer " }), state)).changed).toBe(false)
    expect((await run(setEmployeePosition({ employee: "alice", position: "Editor" }), state)).changed).toBe(true)
    expect((await run(setEmployeePosition({ employee: "alice", position: " " }), state)).staff.position).toBeUndefined()
    expect((await run(setEmployeePosition({ employee: "alice", position: null }), state)).changed).toBe(false)
    const unassigned = initialState()
    expect(
      (await run(setEmployeePosition({ employee: "bob", position: "Analyst" }), unassigned)).staff.departmentId
    ).toBeUndefined()
    expect((await run(listStaff({ includeInactive: true, limit: 10 }), unassigned)).staff).toHaveLength(3)
  })

  it("rejects unknown, inactive, and non-employee people", async () => {
    const state = initialState()
    await expect(run(setEmployeeDepartment({ employee: "missing", department: "Content" }), state)).rejects.toThrow(
      "not found"
    )
    await expect(run(setEmployeeDepartment({ employee: "inactive", department: "Content" }), state)).rejects.toThrow(
      "inactive"
    )
    state.persons.push(person("visitor", "Visitor"))
    await expect(run(setEmployeePosition({ employee: "visitor", position: "Guest" }), state)).rejects.toThrow(
      "not a workspace member"
    )
  })
})

describe("HR requests, holidays, and reports", () => {
  it("creates, reads, filters, updates, reports, and deletes requests", async () => {
    const state = initialState()
    expect((await run(listHrRequestTypes(), state)).types[0]).toMatchObject({ label: "Vacation" })
    const created = await run(
      createHrRequest({
        employee: "alice",
        type: "vacation",
        startDate: "2026-09-01",
        endDate: "2026-09-03",
        description: "Rest"
      }),
      state
    )
    expect(created.request).toMatchObject({ employeeId: "alice", typeId: String(hr.ids.Vacation), description: "Rest" })
    const withoutDescription = initialState()
    expect(
      (
        await run(
          createHrRequest({ employee: "alice", type: "vacation", startDate: "2026-10-01", endDate: "2026-10-01" }),
          withoutDescription
        )
      ).request.description
    ).toBe("")
    expect((await run(getHrRequest({ requestId: created.request.id }), state)).startDate).toBe("2026-09-01")
    expect(
      (
        await run(
          listHrRequests({
            employee: "alice",
            department: "Content",
            startDate: "2026-09-02",
            endDate: "2026-09-04",
            limit: 20
          }),
          state
        )
      ).requests
    ).toHaveLength(1)
    expect((await run(listHrRequests({ startDate: "2026-10-01", limit: 20 }), state)).requests).toHaveLength(0)
    expect((await run(updateHrRequest({ requestId: created.request.id }), state)).changed).toBe(false)
    expect((await run(updateHrRequest({ requestId: created.request.id, type: "vacation" }), state)).changed).toBe(false)
    state.requestTypes.push(requestType(String(hr.ids.Sick), "Sick", 2))
    expect((await run(updateHrRequest({ requestId: created.request.id, type: "sick" }), state)).changed).toBe(true)
    expect(
      (
        await run(
          updateHrRequest({
            requestId: created.request.id,
            type: "Vacation",
            startDate: "2026-09-02",
            endDate: "2026-09-04",
            description: "Updated"
          }),
          state
        )
      ).changed
    ).toBe(true)
    const report = await run(getHrSummaryReport({ startDate: "2026-09-01", endDate: "2026-09-30" }), state)
    expect(report).toMatchObject({
      totalRequests: 1,
      totalCalendarDays: 3,
      groups: [{ requestCount: 1, calendarDays: 3 }]
    })
    expect(
      (
        await run(
          getHrSchedule({
            startDate: "2026-09-01",
            endDate: "2026-09-30",
            department: "Content",
            includeInheritedHolidays: false
          }),
          state
        )
      ).requests
    ).toHaveLength(1)
    expect((await run(deleteHrRequest({ requestId: created.request.id }), state)).deleted).toBe(true)
  })

  it("rejects request errors and supports inactive read filters", async () => {
    const state = initialState()
    await expect(
      run(createHrRequest({ employee: "bob", type: "vacation", startDate: "2026-09-01", endDate: "2026-09-01" }), state)
    ).rejects.toThrow("no HR department")
    await expect(
      run(
        createHrRequest({ employee: "alice", type: "missing", startDate: "2026-09-01", endDate: "2026-09-01" }),
        state
      )
    ).rejects.toThrow("type 'missing' not found")
    state.requestTypes.push(requestType("other", "Vacation"))
    await expect(
      run(
        createHrRequest({ employee: "alice", type: "Vacation", startDate: "2026-09-01", endDate: "2026-09-01" }),
        state
      )
    ).rejects.toThrow("ambiguous")
    await expect(run(getHrRequest({ requestId: "missing" }), state)).rejects.toThrow("not found")
    await expect(run(getHrSchedule({ startDate: "2026-09-02", endDate: "2026-09-01" }), state)).rejects.toThrow(
      "must not"
    )
    await expect(runFailure(listHrRequests({ employee: "inactive", limit: 10 }), state)).resolves.toMatchObject({
      _tag: "Success"
    })
  })

  it("creates idempotent holidays, filters inheritance and dates, updates, and deletes", async () => {
    const state = initialState()
    const root = await run(
      createPublicHoliday({ title: "Company Day", date: "2026-09-10", department: "Organization" }),
      state
    )
    expect(root.changed).toBe(true)
    expect(
      (await run(createPublicHoliday({ title: "Company Day", date: "2026-09-10", department: "Organization" }), state))
        .changed
    ).toBe(false)
    await expect(
      run(createPublicHoliday({ title: "Different", date: "2026-09-10", department: "Organization" }), state)
    ).rejects.toThrow("already exists")
    await run(
      createPublicHoliday({ title: "Content Day", description: "Team", date: "2026-09-12", department: "Content" }),
      state
    )
    expect(
      (
        await run(
          listPublicHolidays({
            department: "Content",
            includeInherited: true,
            startDate: "2026-09-01",
            endDate: "2026-09-30",
            limit: 20
          }),
          state
        )
      ).holidays
    ).toHaveLength(2)
    expect(
      (await run(listPublicHolidays({ department: "Content", includeInherited: false, limit: 20 }), state)).holidays
    ).toHaveLength(1)
    expect((await run(updatePublicHoliday({ holidayId: root.holiday.id }), state)).changed).toBe(false)
    expect(
      (await run(updatePublicHoliday({ holidayId: root.holiday.id, department: "Organization" }), state)).changed
    ).toBe(false)
    expect(
      (
        await run(
          updatePublicHoliday({
            holidayId: root.holiday.id,
            title: "Renamed",
            description: "All",
            date: "2026-09-11",
            department: "Operations"
          }),
          state
        )
      ).changed
    ).toBe(true)
    expect((await run(deletePublicHoliday({ holidayId: root.holiday.id }), state)).deleted).toBe(true)
    await expect(run(deletePublicHoliday({ holidayId: "missing" }), state)).rejects.toThrow("not found")
  })
})
