import {
  createDepartmentParamsJsonSchema,
  DeleteDepartmentResultSchema,
  deleteDepartmentParamsJsonSchema,
  DepartmentMutationResultSchema,
  getDepartmentParamsJsonSchema,
  listDepartmentsParamsJsonSchema,
  ListDepartmentsResultSchema,
  parseCreateDepartmentParams,
  parseDeleteDepartmentParams,
  parseGetDepartmentParams,
  parseListDepartmentsParams,
  parseReconcileDepartmentMembersParams,
  parseUpdateDepartmentParams,
  ReconcileDepartmentMembersResultSchema,
  reconcileDepartmentMembersParamsJsonSchema,
  updateDepartmentParamsJsonSchema
} from "../../domain/schemas/hr-departments.js"
import {
  listStaffParamsJsonSchema,
  ListStaffResultSchema,
  parseListStaffParams,
  parseSetEmployeeDepartmentParams,
  parseSetEmployeePositionParams,
  setEmployeeDepartmentParamsJsonSchema,
  setEmployeePositionParamsJsonSchema,
  StaffMutationResultSchema
} from "../../domain/schemas/hr-staff.js"
import {
  createDepartment,
  deleteDepartment,
  getDepartment,
  listDepartments,
  reconcileDepartmentMembers,
  updateDepartment
} from "../../huly/operations/hr-departments.js"
import { listStaff, setEmployeeDepartment, setEmployeePosition } from "../../huly/operations/hr-staff.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "hr" as const

export const hrTools = [
  defineTool(
    {
      name: "list_departments",
      description:
        "List the Huly HR department hierarchy with direct and inherited members, managers, team leads, and stable hierarchy paths.",
      category: CATEGORY,
      inputSchema: listDepartmentsParamsJsonSchema,
      resultSchema: ListDepartmentsResultSchema
    },
    parseListDepartmentsParams,
    listDepartments
  ),
  defineTool(
    {
      name: "get_department",
      description: "Get one Huly HR department by ID, exact unique name, or slash-separated hierarchy path.",
      category: CATEGORY,
      inputSchema: getDepartmentParamsJsonSchema,
      resultSchema: DepartmentMutationResultSchema.fields.department
    },
    parseGetDepartmentParams,
    getDepartment
  ),
  defineTool(
    {
      name: "create_department",
      description:
        "Create a real Huly HR Department under Organization or another department. Team lead and managers must resolve to active employees.",
      category: CATEGORY,
      inputSchema: createDepartmentParamsJsonSchema,
      resultSchema: DepartmentMutationResultSchema,
      annotations: { destructiveHint: false, idempotentHint: true }
    },
    parseCreateDepartmentParams,
    createDepartment
  ),
  defineTool(
    {
      name: "update_department",
      description:
        "Update a real Huly HR Department. Rejects hierarchy cycles, ambiguous employee locators, inactive managers/leads, and sibling name conflicts.",
      category: CATEGORY,
      inputSchema: updateDepartmentParamsJsonSchema,
      resultSchema: DepartmentMutationResultSchema
    },
    parseUpdateDepartmentParams,
    updateDepartment
  ),
  defineTool(
    {
      name: "delete_department",
      description:
        "Delete a non-root Huly HR Department only when it has no members and no child departments. This action cannot be undone.",
      category: CATEGORY,
      inputSchema: deleteDepartmentParamsJsonSchema,
      resultSchema: DeleteDepartmentResultSchema,
      annotations: { destructiveHint: true, idempotentHint: true }
    },
    parseDeleteDepartmentParams,
    deleteDepartment
  ),
  defineTool(
    {
      name: "reconcile_department_members",
      description:
        "Rebuild each Department.members array from staff primary assignments, including membership in every ancestor department. Supports dry-run.",
      category: CATEGORY,
      inputSchema: reconcileDepartmentMembersParamsJsonSchema,
      resultSchema: ReconcileDepartmentMembersResultSchema
    },
    parseReconcileDepartmentMembersParams,
    reconcileDepartmentMembers
  ),
  defineTool(
    {
      name: "list_staff",
      description:
        "List active or inactive Huly employees with their real HR primary department and official contact position; unassigned employees remain visible.",
      category: CATEGORY,
      inputSchema: listStaffParamsJsonSchema,
      resultSchema: ListStaffResultSchema
    },
    parseListStaffParams,
    listStaff
  ),
  defineTool(
    {
      name: "set_employee_department",
      description:
        "Idempotently set an active employee's primary HR department and reconcile direct plus inherited Department.members arrays.",
      category: CATEGORY,
      inputSchema: setEmployeeDepartmentParamsJsonSchema,
      resultSchema: StaffMutationResultSchema
    },
    parseSetEmployeeDepartmentParams,
    setEmployeeDepartment
  ),
  defineTool(
    {
      name: "set_employee_position",
      description:
        "Idempotently set an active employee's official position on contact.mixin.Employee. Pass null or an empty string to clear it.",
      category: CATEGORY,
      inputSchema: setEmployeePositionParamsJsonSchema,
      resultSchema: StaffMutationResultSchema
    },
    parseSetEmployeePositionParams,
    setEmployeePosition
  )
] as const satisfies ReadonlyArray<RegisteredTool>
