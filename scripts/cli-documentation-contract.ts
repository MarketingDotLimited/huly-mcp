const IMPERATIVE_ACTIONS = new Set([
  "Add",
  "Approve",
  "Archive",
  "Attach",
  "Cancel",
  "Complete",
  "Create",
  "Delete",
  "Describe",
  "Detach",
  "Edit",
  "Get",
  "Hide",
  "Join",
  "Leave",
  "Link",
  "List",
  "Log",
  "Make",
  "Mark",
  "Move",
  "Pin",
  "Preview",
  "Read",
  "Reject",
  "Remove",
  "Rename",
  "Render",
  "Reopen",
  "Replace",
  "Reply",
  "Request",
  "Resolve",
  "Restore",
  "Run",
  "Save",
  "Schedule",
  "Search",
  "Send",
  "Set",
  "Start",
  "Stop",
  "Subscribe",
  "Translate",
  "Unarchive",
  "Unlink",
  "Unsave",
  "Unschedule",
  "Unsubscribe",
  "Upload",
  "Update"
])
const FRAMEWORK_WORDING = /\b(?:dto|effect|implementation|internal|mcp|schema|sdk)\b/i
const ACTION_AND_TARGET_WORDS = 2

interface CliDocumentationEntry {
  readonly command: string
  readonly description: string
}

interface CliFieldDocumentationEntry extends CliDocumentationEntry {
  readonly field: string
}

export const cliDescriptionProblem = (entry: CliDocumentationEntry): string | undefined => {
  const [action, target] = entry.description.trim().split(/\s+/, ACTION_AND_TARGET_WORDS)
  if (action === undefined || !IMPERATIVE_ACTIONS.has(action) || target === undefined) {
    return `${entry.command}: description must start with a reviewed imperative action and name its target.`
  }
  if (FRAMEWORK_WORDING.test(entry.description)) {
    return `${entry.command}: description exposes framework or implementation wording.`
  }
  return undefined
}

export const cliDescriptionProblems = (entries: ReadonlyArray<CliDocumentationEntry>): ReadonlyArray<string> =>
  entries.flatMap((entry) => {
    const problem = cliDescriptionProblem(entry)
    return problem === undefined ? [] : [problem]
  })

export const cliFieldDescriptionProblems = (
  entries: ReadonlyArray<CliFieldDocumentationEntry>
): ReadonlyArray<string> =>
  entries.flatMap((entry) =>
    entry.description.trim().length === 0
      ? [`${entry.command} --${entry.field}: exposed field has no resolved description.`]
      : []
  )
