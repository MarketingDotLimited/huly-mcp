import type { McpToolName } from "../../../src/mcp/tools/index.js"
import { mutationCliCommandCatalog } from "./catalog-mutations.js"
import { parityCliCommandCatalog } from "./catalog-parity.js"
import { readOnlyCliCommandCatalog } from "./catalog-read-only.js"
import type { CliCommandSpec } from "./catalog-types.js"
import { CLI_UPLOAD_SOURCE_SEMANTICS } from "./parity-contract.js"

export const cliCommandCatalog = {
  list_projects: {
    path: ["projects", "list"],
    positional: [],
    description: "List projects",
    human: {
      columns: [
        { field: "identifier", priority: 100, reusable: true },
        { field: "name", priority: 90 },
        { field: "archived", priority: 40 },
        { field: "description", priority: 10 }
      ]
    }
  },
  get_project: { path: ["projects", "get"], positional: ["project"], description: "Get a project" },
  list_statuses: {
    path: ["projects", "statuses"],
    positional: ["project"],
    description: "List project issue statuses"
  },
  list_issues: {
    path: ["issues", "list"],
    positional: [],
    description: "List issues",
    human: {
      columns: [
        { field: "identifier", priority: 100, reusable: true },
        { field: "title", priority: 90 },
        { field: "status", priority: 80 },
        { field: "priority", priority: 60 },
        { field: "assignee", priority: 50 },
        { field: "issueId", priority: 20, reusable: true }
      ]
    }
  },
  get_issue: { path: ["issues", "get"], positional: ["project", "identifier"], description: "Get an issue" },
  create_issue: {
    path: ["issues", "create"],
    positional: [],
    description: "Create an issue",
    behavior: { fileInput: { fields: ["description"] } }
  },
  update_issue: {
    path: ["issues", "update"],
    positional: ["project", "identifier"],
    description: "Update an issue",
    behavior: { fileInput: { fields: ["description"] } }
  },
  move_issue: { path: ["issues", "move"], positional: ["project", "identifier"], description: "Move an issue" },
  add_issue_label: { path: ["issues", "labels", "add"], positional: [], description: "Add an issue label" },
  remove_issue_label: { path: ["issues", "labels", "remove"], positional: [], description: "Remove an issue label" },
  set_issue_milestone: {
    path: ["issues", "milestone", "set"],
    positional: [],
    description: "Set or clear an issue milestone"
  },
  set_issue_component: {
    path: ["issues", "component", "set"],
    positional: [],
    description: "Set or clear an issue component"
  },
  list_issue_relations: { path: ["issues", "relations", "list"], positional: [], description: "List issue relations" },
  add_issue_relation: { path: ["issues", "relations", "add"], positional: [], description: "Add an issue relation" },
  remove_issue_relation: {
    path: ["issues", "relations", "remove"],
    positional: [],
    description: "Remove an issue relation"
  },
  link_document_to_issue: {
    path: ["issues", "documents", "link"],
    positional: [],
    description: "Link a document to an issue"
  },
  unlink_document_from_issue: {
    path: ["issues", "documents", "unlink"],
    positional: [],
    description: "Unlink a document from an issue"
  },
  list_comments: { path: ["comments", "list"], positional: [], description: "List issue comments" },
  add_comment: {
    path: ["comments", "add"],
    positional: [],
    description: "Add an issue comment",
    behavior: { fileInput: { fields: ["body"] } }
  },
  update_comment: {
    path: ["comments", "update"],
    positional: [],
    description: "Update an issue comment",
    behavior: { fileInput: { fields: ["body"] } }
  },
  delete_comment: {
    path: ["comments", "delete"],
    positional: [],
    description: "Delete an issue comment",
    behavior: { confirmation: { type: "requires-yes", message: "comments delete requires --yes." } }
  },
  list_attachments: { path: ["attachments", "list"], positional: [], description: "List attachments" },
  get_attachment: {
    path: ["attachments", "get"],
    positional: ["attachmentId"],
    description: "Get attachment metadata"
  },
  download_attachment: {
    path: ["attachments", "download"],
    positional: ["attachmentId"],
    description: "Resolve or download an attachment",
    behavior: { fileOutput: { attachmentIdField: "attachmentId", type: "attachment-download" } }
  },
  read_attachment_content: {
    path: ["attachments", "read-image"],
    positional: ["attachmentId"],
    description: "Read a supported image attachment; use --output to write its decoded bytes",
    behavior: { fileOutput: { type: "image-content" } }
  },
  add_issue_attachment: {
    path: ["attachments", "add-to-issue"],
    positional: [],
    description: `Add an attachment to an issue. ${CLI_UPLOAD_SOURCE_SEMANTICS}`,
    behavior: { base64FileInput: { fields: ["data"] }, fileInput: { fields: ["description"] } }
  },
  add_document_attachment: {
    path: ["attachments", "add-to-document"],
    positional: [],
    description: `Add an attachment to a document. ${CLI_UPLOAD_SOURCE_SEMANTICS}`,
    behavior: { base64FileInput: { fields: ["data"] }, fileInput: { fields: ["description"] } }
  },
  list_documents: {
    path: ["documents", "list"],
    positional: [],
    description: "List documents",
    human: {
      columns: [
        { field: "id", priority: 100, reusable: true },
        { field: "title", priority: 90 },
        { field: "teamspace", priority: 70 },
        { field: "modifiedOn", priority: 40 }
      ]
    }
  },
  get_document: { path: ["documents", "get"], positional: [], description: "Get a document" },
  create_document: {
    path: ["documents", "create"],
    positional: [],
    description: "Create a document",
    behavior: { fileInput: { fields: ["content"] } }
  },
  edit_document: {
    path: ["documents", "edit"],
    positional: [],
    description: "Edit a document",
    behavior: { fileInput: { fields: ["content", "old_text", "new_text"] } }
  },
  list_inline_comments: {
    path: ["documents", "comments"],
    positional: [],
    description: "List document inline comments"
  },
  list_teamspaces: { path: ["teamspaces", "list"], positional: [], description: "List teamspaces" },
  get_teamspace: { path: ["teamspaces", "get"], positional: ["teamspace"], description: "Get a teamspace" },
  list_labels: { path: ["labels", "list"], positional: [], description: "List labels" },
  list_milestones: { path: ["milestones", "list"], positional: [], description: "List milestones" },
  get_milestone: { path: ["milestones", "get"], positional: [], description: "Get a milestone" },
  list_components: { path: ["components", "list"], positional: [], description: "List components" },
  get_component: { path: ["components", "get"], positional: [], description: "Get a component" },
  list_departments: { path: ["hr", "departments", "list"], positional: [], description: "List HR departments" },
  get_department: {
    path: ["hr", "departments", "get"],
    positional: ["department"],
    description: "Get an HR department"
  },
  create_department: {
    path: ["hr", "departments", "create"],
    positional: ["name"],
    description: "Create an HR department"
  },
  update_department: {
    path: ["hr", "departments", "update"],
    positional: ["department"],
    description: "Update an HR department"
  },
  delete_department: {
    path: ["hr", "departments", "delete"],
    positional: ["department"],
    description: "Delete an empty HR department",
    behavior: { confirmation: { type: "requires-yes", message: "hr departments delete requires --yes." } }
  },
  reconcile_department_members: {
    path: ["hr", "departments", "reconcile"],
    positional: [],
    description: "Replace HR department memberships",
    behavior: { confirmation: { type: "requires-yes", message: "hr departments reconcile requires --yes." } }
  },
  list_staff: { path: ["hr", "staff", "list"], positional: [], description: "List HR staff" },
  set_employee_department: {
    path: ["hr", "staff", "set-department"],
    positional: ["employee", "department"],
    description: "Set an employee HR department"
  },
  set_employee_position: {
    path: ["hr", "staff", "set-position"],
    positional: ["employee", "position"],
    description: "Set an employee position"
  },
  list_hr_request_types: {
    path: ["hr", "request-types", "list"],
    positional: [],
    description: "List HR request types"
  },
  list_hr_requests: { path: ["hr", "requests", "list"], positional: [], description: "List HR requests" },
  get_hr_request: { path: ["hr", "requests", "get"], positional: ["requestId"], description: "Get an HR request" },
  create_hr_request: { path: ["hr", "requests", "create"], positional: [], description: "Create an HR request" },
  update_hr_request: {
    path: ["hr", "requests", "update"],
    positional: ["requestId"],
    description: "Update an HR request"
  },
  delete_hr_request: {
    path: ["hr", "requests", "delete"],
    positional: ["requestId"],
    description: "Delete an HR request",
    behavior: { confirmation: { type: "requires-yes", message: "hr requests delete requires --yes." } }
  },
  list_public_holidays: { path: ["hr", "holidays", "list"], positional: [], description: "List public holidays" },
  create_public_holiday: {
    path: ["hr", "holidays", "create"],
    positional: ["title", "date", "department"],
    description: "Create a public holiday"
  },
  update_public_holiday: {
    path: ["hr", "holidays", "update"],
    positional: ["holidayId"],
    description: "Update a public holiday"
  },
  delete_public_holiday: {
    path: ["hr", "holidays", "delete"],
    positional: ["holidayId"],
    description: "Delete a public holiday",
    behavior: { confirmation: { type: "requires-yes", message: "hr holidays delete requires --yes." } }
  },
  get_hr_schedule: { path: ["hr", "reports", "schedule"], positional: [], description: "Get an HR schedule" },
  get_hr_summary_report: {
    path: ["hr", "reports", "summary"],
    positional: [],
    description: "Get an HR summary report"
  },
  find_huly_documents: {
    path: ["admin", "documents", "find"],
    positional: ["class"],
    description: "Search Huly documents by class"
  },
  prepare_huly_action: {
    path: ["admin", "actions", "prepare"],
    positional: [],
    description: "Preview a guarded Huly action"
  },
  execute_huly_action: {
    path: ["admin", "actions", "execute"],
    positional: ["approvalToken"],
    description: "Run a prepared Huly action",
    behavior: { confirmation: { type: "requires-yes", message: "admin actions execute requires --yes." } }
  },
  fulltext_search: { path: ["search"], positional: ["query"], description: "Search Huly" },
  ...readOnlyCliCommandCatalog,
  ...mutationCliCommandCatalog,
  ...parityCliCommandCatalog
} as const satisfies Record<McpToolName, CliCommandSpec>

export type CliToolName = keyof typeof cliCommandCatalog

export const isCliToolName = (name: string): name is CliToolName => Object.hasOwn(cliCommandCatalog, name)

export const ignoredMcpTools: readonly [] = []
