import {
  CreateHulySequenceResultSchema,
  createHulySequenceParamsJsonSchema,
  DeleteHulySequenceResultSchema,
  deleteHulySequenceParamsJsonSchema,
  parseCreateHulySequenceParams,
  parseDeleteHulySequenceParams,
  parseUpdateHulyCustomSequenceParams,
  UpdateHulyCustomSequenceResultSchema,
  updateHulyCustomSequenceParamsJsonSchema
} from "../../domain/schemas/sequence-administration.js"
import {
  createHulySequence,
  deleteHulySequence,
  updateHulyCustomSequence
} from "../../huly/operations/sequence-administration.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "sequence-administration" as const
const SEQUENCE_WRITE_GUARD =
  "This changes a workspace sequence definition. confirm=true is required so an agent cannot mutate sequence metadata accidentally."

export const sequenceAdministrationTools = [
  defineTool(
    {
      name: "create_huly_sequence",
      description: `Create a zero-valued standard Sequence or prefixed CustomSequence for a class resolved by exact ID, tail name, or label. Retrying returns the matching existing definition and never resets or increments its counter; a different kind or prefix returns a conflict. ${SEQUENCE_WRITE_GUARD}`,
      category: CATEGORY,
      inputSchema: createHulySequenceParamsJsonSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      resultSchema: CreateHulySequenceResultSchema
    },
    parseCreateHulySequenceParams,
    createHulySequence
  ),
  defineTool(
    {
      name: "update_huly_custom_sequence",
      description: `Set only the prefix of a CustomSequence resolved by exact sequence ID or attached class ID/name. The compare-and-set guard does not change the counter and refuses a concurrent change; standard Sequence records are protected. ${SEQUENCE_WRITE_GUARD}`,
      category: CATEGORY,
      inputSchema: updateHulyCustomSequenceParamsJsonSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      resultSchema: UpdateHulyCustomSequenceResultSchema
    },
    parseUpdateHulyCustomSequenceParams,
    updateHulyCustomSequence
  ),
  defineTool(
    {
      name: "delete_huly_sequence",
      description: `Permanently delete a never-used Sequence or CustomSequence resolved by exact sequence ID or attached class ID/name. expectedCurrentValue must be 0 and is an atomic compare-and-delete guard, so an active or advanced counter cannot be removed; referenced CustomSequence records are protected. ${SEQUENCE_WRITE_GUARD}`,
      category: CATEGORY,
      inputSchema: deleteHulySequenceParamsJsonSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      resultSchema: DeleteHulySequenceResultSchema
    },
    parseDeleteHulySequenceParams,
    deleteHulySequence
  )
] as const satisfies ReadonlyArray<RegisteredTool>
