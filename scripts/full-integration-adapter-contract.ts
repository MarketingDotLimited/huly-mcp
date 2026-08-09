import { Schema } from "effect"

import { SupportedAttachmentImageTypeSchema } from "../src/domain/schemas/attachments.js"
import { ToolWarningSchema } from "../src/domain/schemas/tool-warnings.js"

const FullIntegrationTextContentSchema = Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })
const FullIntegrationImageContentSchema = Schema.Struct({
  type: Schema.Literal("image"),
  data: Schema.String,
  mimeType: SupportedAttachmentImageTypeSchema
})
const FullIntegrationContentSchema = Schema.Union(FullIntegrationTextContentSchema, FullIntegrationImageContentSchema)
const FullIntegrationStructuredContentSchema = Schema.Struct({
  result: Schema.Unknown,
  warnings: Schema.optional(Schema.Array(ToolWarningSchema))
})
const FullIntegrationSuccessSchema = Schema.Struct({
  content: Schema.Tuple([FullIntegrationTextContentSchema], FullIntegrationContentSchema),
  structuredContent: FullIntegrationStructuredContentSchema
})
const FullIntegrationErrorSchema = Schema.Struct({
  content: Schema.Tuple(FullIntegrationTextContentSchema),
  isError: Schema.Literal(true)
})
export const FullIntegrationAdapterResultSchema = Schema.Union(FullIntegrationSuccessSchema, FullIntegrationErrorSchema)
export const FullIntegrationAdapterResponseSchema = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Number,
  result: FullIntegrationAdapterResultSchema
})
export type FullIntegrationAdapterResponse = Schema.Schema.Type<typeof FullIntegrationAdapterResponseSchema>
