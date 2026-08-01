import type { EditDocumentInput, EditDocumentParams } from "../../src/domain/schemas/documents.js"
import type { ListIssuesInput, ListIssuesParams } from "../../src/domain/schemas/issues.js"

type IsAssignable<From, To> = [From] extends [To] ? true : false
type RawEditCannotReachOperation = IsAssignable<EditDocumentInput, EditDocumentParams> extends false ? true : never
type RawIssueFiltersCannotReachOperation = IsAssignable<ListIssuesInput, ListIssuesParams> extends false ? true : never

const prove = <T extends true>(value: T): T => value

prove<RawEditCannotReachOperation>(true)
prove<RawIssueFiltersCannotReachOperation>(true)
