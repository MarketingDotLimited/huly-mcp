/**
 * Direct-message conversation schemas. Sibling to channels.ts but kept
 * separate to honour the per-file size limit and group all DM-specific
 * params, JSON schemas, parsers, and result types in one place.
 */
import { Schema } from "effect"

import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"

import { MessageSummarySchema } from "./channels.js"
import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "./document-native-references.js"
import {
  ChannelId,
  DEFAULT_LIMIT,
  DirectMessageIdentifier,
  LimitParam,
  ListTotal,
  MessageId,
  NonEmptyString,
  PersonRefInput
} from "./shared.js"

// --- List DM Messages Params ---

export const ListDmMessagesParamsSchema = Schema.Struct({
  dm: DirectMessageIdentifier.annotate({
    description:
      "Direct-message conversation: either the DM `_id` or a participant display name (e.g. `Kerr,Shannon`). A participant name resolves only to a one-to-one DM with the authenticated account."
  }),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of messages to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({
  title: "ListDmMessagesParams",
  description: "Parameters for listing messages in a direct-message conversation"
})

export type ListDmMessagesParams = Schema.Schema.Type<typeof ListDmMessagesParamsSchema>

// --- Send DM Message Params ---

export const SendDmMessageParamsSchema = Schema.Struct({
  dm: DirectMessageIdentifier.annotate({
    description:
      "Direct-message conversation: either the DM `_id` or a participant display name (e.g. `Kerr,Shannon`). A participant name resolves only to a one-to-one DM with the authenticated account."
  }),
  body: NonEmptyString.annotate({ description: `Message body in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}` })
}).annotate({
  title: "SendDmMessageParams",
  description: "Parameters for sending a message to a direct-message conversation"
})

export type SendDmMessageParams = Schema.Schema.Type<typeof SendDmMessageParamsSchema>

// --- Update DM Message Params ---

export const UpdateDmMessageParamsSchema = Schema.Struct({
  dm: DirectMessageIdentifier.annotate({
    description:
      "Direct-message conversation: either the DM `_id` or a participant display name. A participant name resolves only to a one-to-one DM with the authenticated account."
  }),
  messageId: MessageId.annotate({ description: "Message ID to update" }),
  body: NonEmptyString.annotate({
    description: `New message body in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
  })
}).annotate({ title: "UpdateDmMessageParams", description: "Parameters for updating a direct-message message" })

export type UpdateDmMessageParams = Schema.Schema.Type<typeof UpdateDmMessageParamsSchema>

// --- Delete DM Message Params ---

export const DeleteDmMessageParamsSchema = Schema.Struct({
  dm: DirectMessageIdentifier.annotate({
    description:
      "Direct-message conversation: either the DM `_id` or a participant display name. A participant name resolves only to a one-to-one DM with the authenticated account."
  }),
  messageId: MessageId.annotate({ description: "Message ID to delete" })
}).annotate({ title: "DeleteDmMessageParams", description: "Parameters for deleting a direct-message message" })

export type DeleteDmMessageParams = Schema.Schema.Type<typeof DeleteDmMessageParamsSchema>

// --- Create DM Params ---

export const CreateDirectMessageParamsSchema = Schema.Struct({
  person: PersonRefInput.annotate({
    description:
      "Participant to open a one-to-one DM with: email address or exact display name (e.g. `Smith,Bill`). Resolved via the Employee mixin to a Huly account."
  })
}).annotate({
  title: "CreateDirectMessageParams",
  description:
    "Parameters for opening a one-to-one direct-message conversation with another workspace member. If a one-to-one DM with that participant already exists, it is returned unchanged."
})

export type CreateDirectMessageParams = Schema.Schema.Type<typeof CreateDirectMessageParamsSchema>

// --- JSON Schemas for MCP ---

const dmDescription =
  "Direct-message conversation ID or participant display name. A name resolves only to a one-to-one DM with the authenticated account."

export const listDmMessagesParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(ListDmMessagesParamsSchema),
  { dm: dmDescription, limit: `Maximum number of messages to return (default: ${DEFAULT_LIMIT}).` }
)
export const sendDmMessageParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(SendDmMessageParamsSchema),
  { dm: dmDescription, body: `Message body in Markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}` }
)
export const updateDmMessageParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(UpdateDmMessageParamsSchema),
  {
    dm: dmDescription,
    messageId: "Message ID to update.",
    body: `New message body in Markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
  }
)
export const deleteDmMessageParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(DeleteDmMessageParamsSchema),
  { dm: dmDescription, messageId: "Message ID to delete." }
)
export const createDirectMessageParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(CreateDirectMessageParamsSchema),
  { person: "Participant email address or exact display name used to open a one-to-one direct message." }
)

// --- Parsers ---

export const parseListDmMessagesParams = Schema.decodeUnknownEffect(ListDmMessagesParamsSchema)
export const parseSendDmMessageParams = Schema.decodeUnknownEffect(SendDmMessageParamsSchema)
export const parseUpdateDmMessageParams = Schema.decodeUnknownEffect(UpdateDmMessageParamsSchema)
export const parseDeleteDmMessageParams = Schema.decodeUnknownEffect(DeleteDmMessageParamsSchema)
export const parseCreateDirectMessageParams = Schema.decodeUnknownEffect(CreateDirectMessageParamsSchema)
export const ListDmMessagesResultSchema = Schema.Struct({
  messages: Schema.Array(MessageSummarySchema),
  total: ListTotal
})
export type ListDmMessagesResult = Schema.Schema.Type<typeof ListDmMessagesResultSchema>
export const SendDmMessageResultSchema = Schema.Struct({ id: MessageId, dmId: ChannelId })
export type SendDmMessageResult = Schema.Schema.Type<typeof SendDmMessageResultSchema>
export const UpdateDmMessageResultSchema = Schema.Struct({ id: MessageId, updated: Schema.Boolean })
export type UpdateDmMessageResult = Schema.Schema.Type<typeof UpdateDmMessageResultSchema>
export const DeleteDmMessageResultSchema = Schema.Struct({ id: MessageId, deleted: Schema.Boolean })
export type DeleteDmMessageResult = Schema.Schema.Type<typeof DeleteDmMessageResultSchema>
export const CreateDirectMessageResultSchema = Schema.Struct({ id: ChannelId, created: Schema.Boolean })
export type CreateDirectMessageResult = Schema.Schema.Type<typeof CreateDirectMessageResultSchema>
