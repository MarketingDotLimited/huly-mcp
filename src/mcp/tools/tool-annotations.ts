import type { ToolAnnotations } from "./registry.js"

interface AnnotatedTool {
  readonly name: string
  readonly annotations?: ToolAnnotations
}

type ResolvedToolAnnotations = Required<ToolAnnotations>

const deriveTitle = (name: string): string =>
  name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")

const READ_PREFIXES = ["list_", "get_", "describe_", "search_", "fulltext_", "download_", "preview_", "read_"]
const CREATE_PREFIXES = ["create_", "add_", "upload_", "send_", "log_"]
const UPDATE_PREFIXES = [
  "update_",
  "edit_",
  "set_",
  "approve_",
  "reject_",
  "cancel_",
  "pin_",
  "unpin_",
  "mark_",
  "archive_",
  "start_",
  "stop_",
  "save_",
  "unsave_",
  "remove_",
  "move_"
]
const DELETE_PREFIXES = ["delete_"]

const matchesPrefix = (name: string, prefixes: ReadonlyArray<string>): boolean =>
  prefixes.some((prefix) => name.startsWith(prefix))

const deriveAnnotations = (name: string): ResolvedToolAnnotations => {
  const title = deriveTitle(name)

  if (matchesPrefix(name, READ_PREFIXES)) {
    return { title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
  if (matchesPrefix(name, CREATE_PREFIXES)) {
    return { title, readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }
  if (matchesPrefix(name, UPDATE_PREFIXES)) {
    return { title, readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
  if (matchesPrefix(name, DELETE_PREFIXES)) {
    return { title, readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  }
  return { title, readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
}

const authoredOrDerived = <A>(authored: A | undefined, derived: A): A => authored ?? derived

export const resolveAnnotations = (tool: AnnotatedTool): ResolvedToolAnnotations => {
  const derived = deriveAnnotations(tool.name)
  const authored: ToolAnnotations = tool.annotations ?? {}
  return {
    title: authoredOrDerived(authored.title, derived.title),
    readOnlyHint: authoredOrDerived(authored.readOnlyHint, derived.readOnlyHint),
    destructiveHint: authoredOrDerived(authored.destructiveHint, derived.destructiveHint),
    idempotentHint: authoredOrDerived(authored.idempotentHint, derived.idempotentHint),
    openWorldHint: authoredOrDerived(authored.openWorldHint, derived.openWorldHint)
  }
}
