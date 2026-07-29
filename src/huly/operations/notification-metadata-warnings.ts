import { Effect } from "effect"

import type { Count } from "../../domain/schemas/shared.js"
import { NotificationMetadataDegradedWarningCode } from "../../domain/schemas/tool-warnings.js"
import { Diagnostics } from "../diagnostics.js"

export type ModelMetadataFailure = "unavailable" | "empty" | "invalid"

export type NotificationMetadataWarningDefinition =
  | {
      readonly _tag: "provider"
      readonly subject: "notification-provider"
      readonly presentationFields: "label or description"
    }
  | { readonly _tag: "type"; readonly subject: "notification-type"; readonly presentationFields: "label" }

type FallbackWarningConfig = NotificationMetadataWarningDefinition & {
  readonly modelFailure: ModelMetadataFailure
  readonly invalidRows: Count
}

type AuthoritativeRowsWarningConfig = NotificationMetadataWarningDefinition & { readonly invalidRows: Count }

type PresentationWarningConfig = NotificationMetadataWarningDefinition & {
  readonly omittedFields: Count
  readonly authoritative: boolean
}

export const warnNotificationMetadataFallback = (
  config: FallbackWarningConfig
): Effect.Effect<void, never, Diagnostics> =>
  Effect.gen(function* () {
    const diagnostics = yield* Diagnostics
    const invalidDetail =
      config.invalidRows === 0
        ? ""
        : ` ${config.invalidRows} malformed definition row(s) were omitted after Effect Schema parsing.`
    yield* diagnostics.warnAgent({
      code: NotificationMetadataDegradedWarningCode,
      message:
        `Authoritative Huly model-space ${config.subject} metadata was ${config.modelFailure}; ` +
        `the result uses the server compatibility fallback.${invalidDetail} ` +
        "Treat labels and optional metadata as compatibility data, and use returned IDs for subsequent updates."
    })
  })

export const warnInvalidAuthoritativeNotificationMetadata = (
  config: AuthoritativeRowsWarningConfig
): Effect.Effect<void, never, Diagnostics> =>
  config.invalidRows === 0
    ? Effect.void
    : Effect.gen(function* () {
        const diagnostics = yield* Diagnostics
        yield* diagnostics.warnAgent({
          code: NotificationMetadataDegradedWarningCode,
          message:
            `${config.invalidRows} authoritative Huly model-space ${config.subject} definition row(s) failed Effect Schema parsing ` +
            "and were omitted. Upgrade Huly or inspect model data before trusting the returned metadata as complete."
        })
      })

export const warnOmittedNotificationPresentationMetadata = (
  config: PresentationWarningConfig
): Effect.Effect<void, never, Diagnostics> =>
  config.omittedFields === 0
    ? Effect.void
    : Effect.gen(function* () {
        const diagnostics = yield* Diagnostics
        yield* diagnostics.warnAgent({
          code: NotificationMetadataDegradedWarningCode,
          message:
            `${config.omittedFields} ${config.subject} ${config.presentationFields} field(s) were missing or malformed and were omitted. ` +
            `${
              config.authoritative
                ? "The authoritative model rows need repair."
                : "The server compatibility data is partial."
            } ` +
            "Use the returned definition IDs rather than guessing metadata from an omitted label."
        })
      })
