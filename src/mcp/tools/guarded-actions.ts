import {
  ExecuteHulyActionResultSchema,
  executeHulyActionParamsJsonSchema,
  findHulyDocumentsParamsJsonSchema,
  FindHulyDocumentsResultSchema,
  parseExecuteHulyActionParams,
  parseFindHulyDocumentsParams,
  parsePrepareHulyActionParams,
  prepareHulyActionParamsJsonSchema,
  PrepareHulyActionResultSchema
} from "../../domain/schemas/guarded-actions.js"
import { executeHulyAction, findHulyDocuments, prepareHulyAction } from "../../huly/operations/guarded-actions.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "guarded-administration" as const

export const guardedActionTools = [
  defineTool(
    {
      name: "find_huly_documents",
      description:
        "Run a bounded read-only query against an exact non-system Huly class. Class and field metadata are validated against the live workspace model.",
      category: CATEGORY,
      inputSchema: findHulyDocumentsParamsJsonSchema,
      resultSchema: FindHulyDocumentsResultSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    parseFindHulyDocumentsParams,
    findHulyDocuments
  ),
  defineTool(
    {
      name: "prepare_huly_action",
      description:
        "Validate and preview a generic create, update, mixin, or remove action against live Huly metadata. Returns a five-minute single-use approval token and performs no Huly mutation.",
      category: CATEGORY,
      inputSchema: prepareHulyActionParamsJsonSchema,
      resultSchema: PrepareHulyActionResultSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false }
    },
    parsePrepareHulyActionParams,
    prepareHulyAction
  ),
  defineTool(
    {
      name: "execute_huly_action",
      description:
        "Execute exactly one previously previewed Huly action using its unexpired single-use approval token. Tokens fail after document drift, account mismatch, expiry, or replay.",
      category: CATEGORY,
      inputSchema: executeHulyActionParamsJsonSchema,
      resultSchema: ExecuteHulyActionResultSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false }
    },
    parseExecuteHulyActionParams,
    executeHulyAction
  )
] as const satisfies ReadonlyArray<RegisteredTool>
