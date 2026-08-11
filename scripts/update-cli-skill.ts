import { readFileSync, writeFileSync } from "node:fs"

import { CliConfig, Command, CommandDescriptor, HelpDoc } from "@effect/cli"
import { HashMap, HashSet, Schema } from "effect"

import { cliCommandCatalog } from "../packages/huly-cli/src/catalog.js"
import { CLI_FAILURE_CONTRACT } from "../packages/huly-cli/src/failures.js"
import { authCommand, profileCommand } from "../packages/huly-cli/src/local-commands.js"

const skillPath = "packages/huly-cli/skills/huly-cli/SKILL.md"
const automationPath = "packages/huly-cli/skills/huly-cli/references/automation.md"
const check = process.argv.includes("--check")

const commandPath = (name: keyof typeof cliCommandCatalog): string => `huly ${cliCommandCatalog[name].path.join(" ")}`

const requireSubcommand = <Name extends string, R, E, A>(
  group: Command.Command<Name, R, E, A>,
  expectedGroup: string,
  names: ReadonlyArray<string>
): void => {
  if (!HashSet.has(Command.getNames(group), expectedGroup)) {
    throw new Error(`Expected local CLI group '${expectedGroup}'.`)
  }
  const subcommands = Command.getSubcommands(group)
  const missing = names.filter((name) => !HashMap.has(subcommands, name))
  if (missing.length > 0) throw new Error(`Local CLI group '${expectedGroup}' is missing: ${missing.join(", ")}.`)
}

requireSubcommand(authCommand, "auth", ["login", "status", "logout"])
requireSubcommand(profileCommand, "profile", ["create", "list", "select", "update"])

const commandHelp = <Name extends string, R, E, A>(group: Command.Command<Name, R, E, A>, name: string): string => {
  const command = [...HashMap.values(Command.getSubcommands(group))].find((candidate) =>
    HashSet.has(CommandDescriptor.getNames(candidate), name)
  )
  if (command === undefined) throw new Error(`Missing command help for '${name}'.`)
  return HelpDoc.toAnsiText(CommandDescriptor.getHelp(command, CliConfig.defaultConfig))
}

const skill = `---
name: huly-cli
description: Operate Huly through the @firfi/huly-cli executable. Use when a coding agent needs to authenticate, switch Huly workspaces or projects, discover commands, query structured Huly data, or perform confirmed Huly mutations from a shell or automation workflow.
---

# Huly CLI

Use the CLI's own help and JSON contracts as the authority. Do not memorize or reproduce its complete command catalog.

## Set up authentication

Install the package with \`pnpm add --global @firfi/huly-cli\`, then run:

\`\`\`bash
huly auth login
huly auth status --json
\`\`\`

Use \`huly profile create|list|select|update\` for named URL, workspace, and default-project contexts. Environment variables take priority over the active profile. Never print, copy into chat, or persist a password; login stores only the returned token in the operating system's user config directory.

Key local command surfaces:

\`huly auth login [--profile <name>] [--json]\`
\`huly auth logout [--profile <name>] [--json]\`
\`huly profile create <name> --url <url> --workspace <workspace> [--default-project <project>] [--json]\`
\`huly profile update <name> [--url <url>] [--workspace <workspace>] [--default-project <project> | --clear-default-project] [--json]\`

## Discover before acting

1. Run \`huly --help\` to discover groups.
2. Run \`huly <group> --help\` and then leaf \`--help\` to learn exact fields.
3. Add \`--json\` for a lossless machine-readable result.
4. Inspect the target before a mutation.
5. Add \`--yes\` only after checking commands marked as consequential.

Reusable identifiers in human tables are safe to copy, but prefer JSON for automation.

## High-value workflows

List projects and issues:

\`\`\`bash
${commandPath("list_projects")} --json
${commandPath("list_issues")} --project HULY --json
${commandPath("get_issue")} HULY HULY-123 --json
\`\`\`

Search broadly before choosing a specialized command:

\`\`\`bash
${commandPath("fulltext_search")} "release blocker" --json
\`\`\`

For scripts, read [references/automation.md](references/automation.md) before handling failures or retries.
`

const requiredLocalSurface = [
  {
    help: commandHelp(authCommand, "login"),
    command: "login",
    description: "store only the resulting token",
    flags: ["profile", "json"]
  },
  {
    help: commandHelp(authCommand, "status"),
    command: "status",
    description: "sanitized authentication",
    flags: ["json"]
  },
  {
    help: commandHelp(authCommand, "logout"),
    command: "logout",
    description: "Remove the stored token",
    flags: ["profile", "json"]
  },
  {
    help: commandHelp(profileCommand, "create"),
    command: "create",
    description: "Create a named URL and workspace profile",
    flags: ["url", "workspace", "default-project", "json"]
  },
  { help: commandHelp(profileCommand, "list"), command: "list", description: "List named profiles", flags: ["json"] },
  {
    help: commandHelp(profileCommand, "select"),
    command: "select",
    description: "Select the active profile",
    flags: ["json"]
  },
  {
    help: commandHelp(profileCommand, "update"),
    command: "update",
    description: "Update a named profile",
    flags: ["url", "workspace", "default-project", "clear-default-project", "json"]
  }
] as const

for (const surface of requiredLocalSurface) {
  if (!surface.help.includes(surface.description)) {
    throw new Error(`Local CLI description drifted for '${surface.command}'.`)
  }
  for (const flag of surface.flags) {
    if (!surface.help.includes(`--${flag}`)) {
      throw new Error(`Local CLI flag '--${flag}' is missing from ${surface.command}.`)
    }
    if (!skill.includes(`--${flag}`)) throw new Error(`Generated skill does not document local flag '--${flag}'.`)
  }
}

const failureRows = Object.entries(CLI_FAILURE_CONTRACT)
  .map(([kind, entry]) => `| \`${entry.code}\` | ${kind} | ${entry.exitStatus} |`)
  .join("\n")

const automation = `# Structured automation

Keep stdout for successful command results and parse expected failures from stderr.

## Failure document

\`\`\`json
{
  "code": "NOT_FOUND",
  "message": "Issue HULY-404 was not found.",
  "retryable": false,
  "hint": "Optional next action",
  "details": { "tag": "IssueNotFoundError" }
}
\`\`\`

\`hint\` and \`details\` are optional. Secret values are never part of the contract.

| Code | Class | Exit status |
| --- | --- | ---: |
${failureRows}

Exit status 70 distinguishes an internal CLI defect. Retry only when \`retryable\` is true, and never blindly retry a consequential write.

## Shell pattern

\`\`\`bash
result_file="$(mktemp)"
error_file="$(mktemp)"
if ${commandPath("list_issues")} --project HULY --json >"$result_file" 2>"$error_file"; then
  jq '.[] | {identifier, title, status}' "$result_file"
else
  jq '{code, message, retryable, hint}' "$error_file" >&2
fi
\`\`\`

Use temporary files or another mechanism that preserves stdout/stderr separation. Do not merge streams before parsing.
`

const GeneratedFilesSchema = Schema.Struct({ skill: Schema.String, automation: Schema.String })
const generated = Schema.decodeUnknownSync(GeneratedFilesSchema)({ skill, automation })
const current = (): typeof generated => ({
  skill: readFileSync(skillPath, "utf8"),
  automation: readFileSync(automationPath, "utf8")
})

if (check) {
  const existing = current()
  if (existing.skill !== generated.skill || existing.automation !== generated.automation) {
    console.error("Published Huly CLI Agent Skill is stale. Run `pnpm update-cli-skill`.")
    process.exitCode = 1
  } else {
    console.log("Huly CLI Agent Skill matches command and failure contracts.")
  }
} else {
  writeFileSync(skillPath, generated.skill)
  writeFileSync(automationPath, generated.automation)
  console.log("Updated published Huly CLI Agent Skill.")
}
