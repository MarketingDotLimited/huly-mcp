import type { McpToolName } from "../../../src/mcp/tools/index.js"
import type { CliBehaviorClass, CliDedicatedLiveRiskClass } from "./parity-contract.js"

interface CliLiveCoverageCase {
  readonly behaviors: ReadonlyArray<CliBehaviorClass>
  readonly id: string
  readonly risks: ReadonlyArray<CliDedicatedLiveRiskClass>
  readonly tools: ReadonlyArray<McpToolName>
}

export type CliIntegrationCoverageDecision =
  | { readonly caseIds: ReadonlyArray<string>; readonly type: "dedicated-live" }
  | { readonly rationale: "shared-operation-and-adapter-class"; readonly type: "representative" }

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
  { id: "agent-warning", tools: ["list_workbench_applications"], behaviors: ["agent-warning"], risks: [] },
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
  { id: "caller-private-status", tools: ["get_support_status"], behaviors: [], risks: ["privacy"] }
]

export const cliIntegrationCoverageDecision = (toolName: McpToolName): CliIntegrationCoverageDecision => {
  const caseIds = CLI_LIVE_COVERAGE_CASES.filter((coverageCase) => coverageCase.tools.includes(toolName)).map(
    (coverageCase) => coverageCase.id
  )
  return caseIds.length === 0
    ? { type: "representative", rationale: "shared-operation-and-adapter-class" }
    : { type: "dedicated-live", caseIds }
}
