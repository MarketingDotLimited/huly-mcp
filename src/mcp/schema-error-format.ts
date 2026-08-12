import { Formatter, type Schema, SchemaIssue } from "effect"

const formatLegacyLeaf: SchemaIssue.LeafHook = (issue) => {
  if (issue._tag === "MissingKey") return issue.annotations?.messageMissingKey ?? "is missing"
  if (issue._tag !== "InvalidType") return SchemaIssue.defaultLeafHook(issue)
  const authoredMessage = issue.ast.annotations?.message
  if (typeof authoredMessage === "string") return authoredMessage
  const expected = SchemaIssue.defaultLeafHook(new SchemaIssue.InvalidType(issue.ast))
  return SchemaIssue.hasInput(issue) ? `${expected}, actual ${Formatter.format(issue.input)}` : expected
}

const formatSchemaIssues = SchemaIssue.makeFormatterStandardSchemaV1({ leafHook: formatLegacyLeaf })

export const formatParseError = (error: Schema.SchemaError): string =>
  formatSchemaIssues(error.issue)
    .issues.map((issue) => `${issue.path?.map(String).join(".") ?? ""}: ${issue.message}`)
    .join("; ")
