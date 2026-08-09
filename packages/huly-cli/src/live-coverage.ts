import type { McpToolName } from "../../../src/mcp/tools/index.js"
import type { CliBehaviorClass, CliDedicatedLiveRiskClass } from "./parity-contract.js"

interface CliLiveCoverageCase {
  readonly behaviors: ReadonlyArray<CliBehaviorClass>
  readonly id: string
  readonly risks: ReadonlyArray<CliDedicatedLiveRiskClass>
  readonly tools: ReadonlyArray<McpToolName>
}

export const CLI_LIVE_COVERAGE_CASES: ReadonlyArray<CliLiveCoverageCase> = [
  { id: "scalar-read", tools: ["list_projects"], behaviors: ["scalar-input"], risks: [] },
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
  { id: "structured-output", tools: ["list_projects"], behaviors: ["structured-output"], risks: [] },
  { id: "binary-download", tools: ["download_attachment"], behaviors: ["binary-output"], risks: ["transport"] },
  { id: "image-output", tools: ["read_attachment_content"], behaviors: ["image-output"], risks: ["transport"] },
  { id: "agent-warning", tools: ["list_workbench_applications"], behaviors: ["agent-warning"], risks: [] },
  { id: "typed-error", tools: ["get_issue"], behaviors: ["typed-error"], risks: [] },
  {
    id: "consequential-refusals",
    tools: [
      "create_workspace",
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
