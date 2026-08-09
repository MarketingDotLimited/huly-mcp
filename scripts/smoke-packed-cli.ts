import { spawnSync } from "node:child_process"

import { Schema } from "effect"

import { CLI_COVERAGE_REVIEWED_REGISTRY_OPERATIONS } from "../packages/huly-cli/src/live-coverage.js"

const PackedCliArgumentsSchema = Schema.Tuple(
  Schema.NonEmptyTrimmedString.annotations({ description: "Path to the installed packed huly executable." })
)
const NODE_ARGUMENT_OFFSET = 2

const [executable] = Schema.decodeUnknownSync(PackedCliArgumentsSchema)(process.argv.slice(NODE_ARGUMENT_OFFSET))

const runCli = (args: ReadonlyArray<string>) => {
  const result = spawnSync(executable, args, { encoding: "utf8" })
  if (result.error !== undefined) throw result.error
  return result
}

const rootHelp = runCli(["--help"])
if (rootHelp.status !== 0) throw new Error(`Packed CLI root help failed: ${rootHelp.stderr}`)
const commandSection = rootHelp.stdout.split("Commands:\n")[1]
if (commandSection === undefined) throw new Error("Packed CLI root help has no command section.")
const commands = commandSection
  .split("\n")
  .filter((line) => line.startsWith("  "))
  .map((line) => line.trim().split(/\s{2,}/)[0])
  .filter((command): command is string => command !== undefined)
const commandSet = new Set(commands)

if (commandSet.size !== CLI_COVERAGE_REVIEWED_REGISTRY_OPERATIONS) {
  throw new Error(
    `Packed CLI exposes ${String(commandSet.size)} commands; expected ${String(CLI_COVERAGE_REVIEWED_REGISTRY_OPERATIONS)}.`
  )
}

const categoryRepresentativeCommands = [
  "activity list",
  "approvals list",
  "attachments list",
  "boards list",
  "calendar events list",
  "cards spaces list",
  "channels list",
  "collaborators object list",
  "comments list",
  "contacts persons list",
  "custom-fields list",
  "drive list",
  "inventory categories list",
  "issues list",
  "labels list",
  "leads funnels list",
  "mail threads list",
  "milestones list",
  "model classes list",
  "model enums create",
  "model permissions create",
  "model sequences create",
  "notifications providers list",
  "office floors list",
  "platform associations list",
  "planner todos labels definitions list",
  "preferences spaces list",
  "processes list",
  "project-types list",
  "projects list",
  "recruiting vacancy types list",
  "search",
  "spaces list",
  "storage upload",
  "support status get",
  "tags categories list",
  "tags list",
  "teamspaces list",
  "templates categories list",
  "tests projects list",
  "time log",
  "user-statuses list",
  "views filtered list",
  "workbench applications list",
  "workflow-statuses list",
  "workspace members list"
]
const missingRepresentatives = categoryRepresentativeCommands.filter((command) => !commandSet.has(command))
if (missingRepresentatives.length > 0) {
  throw new Error(`Packed CLI is missing category representatives: ${missingRepresentatives.join(", ")}.`)
}

const behaviorSpecificLeafHelpCommands = [
  ["attachments", "add"],
  ["attachments", "download"],
  ["attachments", "read-image"],
  ["calendar", "events", "recurring", "create"],
  ["comments", "add"],
  ["support", "status", "get"],
  ["workbench", "applications", "list"],
  ["workspace", "info"]
]
const leafHelpCommands = [
  ...categoryRepresentativeCommands.map((command) => command.split(" ")),
  ...behaviorSpecificLeafHelpCommands
].filter(
  (command, index, commands) => commands.findIndex((candidate) => candidate.join(" ") === command.join(" ")) === index
)
for (const command of leafHelpCommands) {
  const help = runCli([...command, "--help"])
  if (help.status !== 0 || !help.stdout.includes("USAGE")) {
    throw new Error(`Packed CLI leaf help failed for '${command.join(" ")}': ${help.stderr}`)
  }
}

const refusal = runCli(["boards", "cards", "delete", "board", "card"])
if (refusal.status === 0 || !refusal.stderr.includes("requires --yes")) {
  throw new Error("Packed CLI did not enforce the consequential-operation confirmation boundary.")
}

const structuredFailure = runCli(["calendar", "events", "recurring", "create", "title", "1", "--rules", "not-json"])
if (structuredFailure.status === 0 || !structuredFailure.stderr.includes("has invalid JSON")) {
  throw new Error("Packed CLI did not parse structured input before client construction.")
}

console.log(
  `Packed CLI smoke passed: ${String(commandSet.size)} routes, all category representatives, adapter help, confirmation, and structured-input preflight.`
)
