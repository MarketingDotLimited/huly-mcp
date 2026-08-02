import { Effect } from "effect"

import {
  DEFAULT_EXTERNAL_CHANNEL_MESSAGE_LIMIT,
  type ListExternalChannelMessagesParams,
  type ListExternalChannelMessagesResult
} from "../../domain/schemas/external-channel-messages.js"
import { type LimitParam, NonEmptyString, ObjectClassName } from "../../domain/schemas/shared.js"
import { ExternalChannelRuntimeUnsupportedWarningCode } from "../../domain/schemas/tool-warnings.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import { core, gmail } from "../huly-plugins.js"
import { hulyQuery } from "./query-helpers.js"
import type { MetadataClassDoc } from "./sdk-discovery-mappers.js"
import { toClassRef, toRef } from "./sdk-boundary.js"

const TELEGRAM_PACKAGE_INCOMPATIBLE_REASON =
  "package-incompatible: no compatible published Huly Telegram message SDK package is installed in this build"

const GMAIL_MODEL_UNAVAILABLE_REASON =
  "model-unavailable: @hcengineering/gmail@0.7.0 is installed, but this Huly workspace does not expose gmail:class:Message"

const GMAIL_RUNTIME_UNVERIFIABLE_REASON =
  "runtime-unverifiable: @hcengineering/gmail@0.7.0 exposes the legacy Message model, but Huly does not expose the deployment-wide Gmail writer version needed to distinguish v1 records from stale data after a v2 upgrade"

const modelClassRef = toClassRef<MetadataClassDoc>(core.class.Class)
const gmailMessageModelId = ObjectClassName.make(String(gmail.class.Message))

const gmailUnsupportedResult = (
  params: ListExternalChannelMessagesParams,
  limit: LimitParam,
  unsupportedReasonCode: "model-unavailable" | "runtime-unverifiable",
  unsupportedReason: NonEmptyString
): ListExternalChannelMessagesResult => ({
  supported: false,
  provider: "gmail",
  channel: params.channel,
  limit,
  unsupportedReasonCode,
  unsupportedReason,
  messages: []
})

const telegramUnsupportedResult = (
  params: ListExternalChannelMessagesParams,
  limit: LimitParam
): ListExternalChannelMessagesResult => ({
  supported: false,
  provider: "telegram",
  channel: params.channel,
  limit,
  unsupportedReasonCode: "package-incompatible",
  unsupportedReason: NonEmptyString.make(TELEGRAM_PACKAGE_INCOMPATIBLE_REASON),
  messages: []
})

const hasGmailMessageModel = (client: HulyClient["Type"]): Effect.Effect<boolean, HulyClientError> =>
  Effect.map(
    client.findAllInModel<MetadataClassDoc>(
      modelClassRef,
      hulyQuery<MetadataClassDoc>({ _id: toRef<MetadataClassDoc>(gmailMessageModelId) }),
      { limit: 1 }
    ),
    (classes) => classes.length > 0
  )

const warnUnsupportedGmailRuntime = (reason: NonEmptyString): Effect.Effect<void, never, Diagnostics> =>
  Effect.flatMap(Diagnostics, (diagnostics) =>
    diagnostics.warnAgent({ code: ExternalChannelRuntimeUnsupportedWarningCode, message: reason })
  )

/**
 * Compatibility assessment for published external-message packages.
 * The Gmail package exposes a sound legacy Message contract, but the actual writer version is deployment config,
 * not authoritative workspace metadata. Until that live runtime can be queried, reads must remain unsupported.
 */
export const listExternalChannelMessages = (
  params: ListExternalChannelMessagesParams
): Effect.Effect<ListExternalChannelMessagesResult, HulyClientError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const limit = params.limit ?? DEFAULT_EXTERNAL_CHANNEL_MESSAGE_LIMIT
    if (params.provider === "telegram") {
      return telegramUnsupportedResult(params, limit)
    }

    const client = yield* HulyClient
    const hasModel = yield* hasGmailMessageModel(client)
    const reasonCode = hasModel ? "runtime-unverifiable" : "model-unavailable"
    const reason = NonEmptyString.make(hasModel ? GMAIL_RUNTIME_UNVERIFIABLE_REASON : GMAIL_MODEL_UNAVAILABLE_REASON)
    yield* warnUnsupportedGmailRuntime(reason)
    return gmailUnsupportedResult(params, limit, reasonCode, reason)
  })
