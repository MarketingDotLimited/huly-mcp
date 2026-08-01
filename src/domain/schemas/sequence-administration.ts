import { JSONSchema, Schema } from "effect"

import { ModelIdentifier } from "./model-administration.js"
import { HulySequenceId, HulySequencePrefix, HulySequenceSummarySchema } from "./sdk-discovery-configurations.js"

export const SequenceIdentifier = Schema.String.pipe(
  Schema.trimmed(),
  Schema.nonEmptyString(),
  Schema.brand("SequenceIdentifier")
).annotations({
  description: "Exact sequence ID or attached class ID/name. Resolution tries sequence ID first, then class."
})
export type SequenceIdentifier = Schema.Schema.Type<typeof SequenceIdentifier>

const ConfirmSequenceWrite = Schema.Literal(true).annotations({
  description: "Must be true to acknowledge that this operation changes a Huly sequence definition."
})

const CreateStandardSequenceParamsSchema = Schema.Struct({
  class: ModelIdentifier.annotations({ description: "Attached class ID or exact class name/label." }),
  kind: Schema.Literal("standard"),
  confirm: ConfirmSequenceWrite
})

const CreateCustomSequenceParamsSchema = Schema.Struct({
  class: ModelIdentifier.annotations({ description: "Attached class ID or exact class name/label." }),
  kind: Schema.Literal("custom"),
  prefix: HulySequencePrefix,
  confirm: ConfirmSequenceWrite
})

export const CreateHulySequenceParamsSchema = Schema.Union(
  CreateStandardSequenceParamsSchema,
  CreateCustomSequenceParamsSchema
).annotations({ title: "CreateHulySequenceParams" })
export type CreateHulySequenceParams = Schema.Schema.Type<typeof CreateHulySequenceParamsSchema>

export const UpdateHulyCustomSequenceParamsSchema = Schema.Struct({
  sequence: SequenceIdentifier,
  prefix: HulySequencePrefix,
  confirm: ConfirmSequenceWrite
}).annotations({ title: "UpdateHulyCustomSequenceParams" })
export type UpdateHulyCustomSequenceParams = Schema.Schema.Type<typeof UpdateHulyCustomSequenceParamsSchema>

export const DeleteHulySequenceParamsSchema = Schema.Struct({
  sequence: SequenceIdentifier,
  expectedCurrentValue: Schema.Literal(0).annotations({
    description:
      "Must be 0. Only a never-used sequence can be deleted, and deletion is refused if its counter advanced."
  }),
  confirm: ConfirmSequenceWrite
}).annotations({ title: "DeleteHulySequenceParams" })
export type DeleteHulySequenceParams = Schema.Schema.Type<typeof DeleteHulySequenceParamsSchema>

export const CreateHulySequenceResultSchema = Schema.Struct({
  sequence: HulySequenceSummarySchema,
  created: Schema.Boolean
})
export type CreateHulySequenceResult = Schema.Schema.Type<typeof CreateHulySequenceResultSchema>

export const UpdateHulyCustomSequenceResultSchema = Schema.Struct({
  sequence: HulySequenceSummarySchema,
  updated: Schema.Boolean
})
export type UpdateHulyCustomSequenceResult = Schema.Schema.Type<typeof UpdateHulyCustomSequenceResultSchema>

export const DeleteHulySequenceResultSchema = Schema.Struct({ sequenceId: HulySequenceId, deleted: Schema.Boolean })
export type DeleteHulySequenceResult = Schema.Schema.Type<typeof DeleteHulySequenceResultSchema>

export const createHulySequenceParamsJsonSchema = JSONSchema.make(CreateHulySequenceParamsSchema)
export const updateHulyCustomSequenceParamsJsonSchema = JSONSchema.make(UpdateHulyCustomSequenceParamsSchema)
export const deleteHulySequenceParamsJsonSchema = JSONSchema.make(DeleteHulySequenceParamsSchema)

const strictParseOptions = { onExcessProperty: "error" } as const
export const parseCreateHulySequenceParams = Schema.decodeUnknown(CreateHulySequenceParamsSchema, strictParseOptions)
export const parseUpdateHulyCustomSequenceParams = Schema.decodeUnknown(
  UpdateHulyCustomSequenceParamsSchema,
  strictParseOptions
)
export const parseDeleteHulySequenceParams = Schema.decodeUnknown(DeleteHulySequenceParamsSchema, strictParseOptions)
