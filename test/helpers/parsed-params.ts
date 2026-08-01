import { Schema } from "effect"

import { EditDocumentParamsSchema } from "../../src/domain/schemas/documents.js"
import type { ListIssuesInput } from "../../src/domain/schemas/issues.js"
import { ListIssuesParamsSchema } from "../../src/domain/schemas/issues.js"

export const editDocumentParams = Schema.decodeUnknownSync(EditDocumentParamsSchema)

export const listIssuesParams = (input: ListIssuesInput) => Schema.decodeUnknownSync(ListIssuesParamsSchema)(input)
