import { JSONSchema, Schema } from "effect"

import { ChannelIdentifier, DEFAULT_LIMIT, LimitParam, NonEmptyString } from "./shared.js"

export const ExternalChannelMessageProviderValues = ["gmail", "telegram"] as const

export const ExternalChannelMessageProviderSchema = Schema.Literal(...ExternalChannelMessageProviderValues)

export const DEFAULT_EXTERNAL_CHANNEL_MESSAGE_LIMIT = DEFAULT_LIMIT

export const ListExternalChannelMessagesParamsSchema = Schema.Struct({
  provider: ExternalChannelMessageProviderSchema.annotations({
    description:
      "External provider to assess. Gmail and Telegram currently return structured unsupported results because this build cannot prove a compatible active provider runtime without inventing data."
  }),
  channel: ChannelIdentifier.annotations({
    description:
      "Provider channel locator to echo in the assessment result. For Gmail, use an exact correspondent email address or Huly contact-channel ID. For Telegram, use a chat name or ID."
  }),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Requested maximum message count to echo in the result (default: ${DEFAULT_EXTERNAL_CHANNEL_MESSAGE_LIMIT}, max: 200).`
    })
  )
}).annotations({
  title: "ListExternalChannelMessagesParams",
  description: "Parameters for assessing whether external channel messages can be listed safely."
})

export type ListExternalChannelMessagesParams = Schema.Schema.Type<typeof ListExternalChannelMessagesParamsSchema>

export type ExternalChannelMessageProvider = Schema.Schema.Type<typeof ExternalChannelMessageProviderSchema>

const ExternalChannelMessagesUnsupportedBaseSchema = Schema.Struct({
  supported: Schema.Literal(false),
  channel: ChannelIdentifier,
  limit: LimitParam,
  unsupportedReason: NonEmptyString,
  messages: Schema.Tuple()
})

export const ListExternalChannelMessagesResultSchema = Schema.Union(
  Schema.Struct({
    ...ExternalChannelMessagesUnsupportedBaseSchema.fields,
    provider: Schema.Literal("gmail"),
    unsupportedReasonCode: Schema.Literal("model-unavailable", "runtime-unverifiable")
  }),
  Schema.Struct({
    ...ExternalChannelMessagesUnsupportedBaseSchema.fields,
    provider: Schema.Literal("telegram"),
    unsupportedReasonCode: Schema.Literal("package-incompatible")
  })
).annotations({
  title: "ListExternalChannelMessagesResult",
  description:
    "Explicit no-fake-data result explaining why the requested external provider cannot be read safely in this build."
})

export type ListExternalChannelMessagesResult = Schema.Schema.Type<typeof ListExternalChannelMessagesResultSchema>

export const listExternalChannelMessagesParamsJsonSchema = JSONSchema.make(ListExternalChannelMessagesParamsSchema)
export const parseListExternalChannelMessagesParams = Schema.decodeUnknown(ListExternalChannelMessagesParamsSchema)
export const encodeListExternalChannelMessagesResult = Schema.encodeSync(ListExternalChannelMessagesResultSchema)
