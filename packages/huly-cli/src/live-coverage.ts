import type { McpToolName } from "../../../src/mcp/tools/index.js"
import type { CliBehaviorClass, CliDedicatedLiveRiskClass } from "./parity-contract.js"

interface CliLiveCoverageCase {
  readonly behaviors: ReadonlyArray<CliBehaviorClass>
  readonly id: string
  readonly risks: ReadonlyArray<CliDedicatedLiveRiskClass>
  readonly tools: ReadonlyArray<McpToolName>
}

export type CliIntegrationCoverageDecision =
  | {
      readonly caseIds: ReadonlyArray<string>
      readonly risks: ReadonlyArray<CliDedicatedLiveRiskClass>
      readonly type: "dedicated-live"
    }
  | {
      readonly rationale: "shared-operation-and-adapter-class"
      readonly risks: ReadonlyArray<CliDedicatedLiveRiskClass>
      readonly type: "representative"
    }

export const CLI_COVERAGE_REVIEWED_REGISTRY_OPERATIONS = 522

const CLI_REVIEWED_CATEGORY_POTENTIAL_RISKS = [
  ["activity", []],
  ["approvals", []],
  ["associations", []],
  ["attachments", ["transport"]],
  ["boards", []],
  ["calendar", ["lifecycle"]],
  ["cards", []],
  ["channels", ["privacy"]],
  ["collaborators", []],
  ["comments", []],
  ["contacts", ["privacy"]],
  ["custom-fields", []],
  ["documents", []],
  ["drive", []],
  ["inventory", []],
  ["issues", []],
  ["labels", []],
  ["leads", ["privacy"]],
  ["mail", ["privacy"]],
  ["milestones", []],
  ["model-administration", []],
  ["notifications", ["privacy"]],
  ["planner", []],
  ["preferences", ["privacy"]],
  ["processes", ["lifecycle"]],
  ["projects", []],
  ["recruiting", ["privacy"]],
  ["sdk-discovery", []],
  ["search", []],
  ["security-administration", ["privacy"]],
  ["sequence-administration", []],
  ["spaces", []],
  ["storage", ["transport"]],
  ["support", ["privacy"]],
  ["tag-categories", []],
  ["tags", []],
  ["task-management", []],
  ["templates", []],
  ["test-management", []],
  ["time tracking", ["lifecycle"]],
  ["user-statuses", ["privacy"]],
  ["views", []],
  ["virtual-office", ["privacy"]],
  ["workbench", ["privacy"]],
  ["workflow-statuses", []],
  ["workspace", ["lifecycle", "workspace-client"]]
] as const satisfies ReadonlyArray<readonly [string, ReadonlyArray<CliDedicatedLiveRiskClass>]>

export const CLI_REVIEWED_COVERAGE_CATEGORIES = CLI_REVIEWED_CATEGORY_POTENTIAL_RISKS.map(([category]) => category)

const assertReviewedCategory = (category: string): void => {
  const reviewed = CLI_REVIEWED_CATEGORY_POTENTIAL_RISKS.find(([candidate]) => candidate === category)
  if (reviewed === undefined) {
    throw new Error(`CLI integration risk classification is missing category '${category}'.`)
  }
}

export const CLI_LIVE_COVERAGE_CASES: ReadonlyArray<CliLiveCoverageCase> = [
  {
    id: "scalar-structured-read",
    tools: ["list_projects"],
    behaviors: ["scalar-input", "structured-output"],
    risks: []
  },
  {
    id: "structured-calendar-lifecycle",
    tools: ["create_event", "delete_event"],
    behaviors: ["structured-json-input"],
    risks: ["lifecycle"]
  },
  {
    id: "nullable-drawing-lifecycle",
    tools: ["create_drawing", "update_drawing", "delete_drawing"],
    behaviors: ["nullable-clear-input"],
    risks: ["lifecycle"]
  },
  { id: "text-file-input", tools: ["add_comment"], behaviors: ["text-file-input"], risks: [] },
  { id: "raw-upload", tools: ["add_attachment"], behaviors: ["upload-input"], risks: ["transport"] },
  { id: "binary-download", tools: ["download_attachment"], behaviors: ["binary-output"], risks: ["transport"] },
  { id: "image-output", tools: ["read_attachment_content"], behaviors: ["image-output"], risks: ["transport"] },
  { id: "agent-warning", tools: ["list_workbench_applications"], behaviors: ["agent-warning"], risks: ["privacy"] },
  { id: "typed-error", tools: ["get_issue"], behaviors: ["typed-error"], risks: [] },
  {
    id: "consequential-refusals",
    tools: [
      "create_workspace",
      "update_member_role",
      "approve_approval_request",
      "add_space_members",
      "start_process",
      "mark_all_notifications_read"
    ],
    behaviors: ["consequential-confirmation"],
    risks: ["safety"]
  },
  {
    id: "workspace-client-read",
    tools: ["get_workspace_info"],
    behaviors: ["workspace-administration"],
    risks: ["workspace-client"]
  },
  { id: "caller-private-status", tools: ["get_support_status"], behaviors: [], risks: ["privacy"] },
  { id: "external-channel-privacy", tools: ["list_external_channel_messages"], behaviors: [], risks: ["privacy"] },
  { id: "mail-thread-privacy", tools: ["list_mail_threads"], behaviors: [], risks: ["privacy"] }
]

export const cliIntegrationCoverageDecision = (
  toolName: McpToolName,
  category: string
): CliIntegrationCoverageDecision => {
  assertReviewedCategory(category)
  const cases = CLI_LIVE_COVERAGE_CASES.filter((coverageCase) => coverageCase.tools.includes(toolName))
  const risks = [...new Set(cases.flatMap((coverageCase) => coverageCase.risks))]
  return cases.length === 0
    ? { type: "representative", rationale: "shared-operation-and-adapter-class", risks: [] }
    : { type: "dedicated-live", caseIds: cases.map((coverageCase) => coverageCase.id), risks }
}
