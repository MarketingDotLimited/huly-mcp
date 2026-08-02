import { describe, it } from "@effect/vitest"
import type { PersonId } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import { Effect, Either, Schema } from "effect"
import { expect } from "vitest"

import {
  DEFAULT_EXTERNAL_CHANNEL_MESSAGE_LIMIT,
  ListExternalChannelMessagesParamsSchema,
  ListExternalChannelMessagesResultSchema
} from "../../domain/schemas/external-channel-messages.js"
import { ChannelIdentifier } from "../../domain/schemas/shared.js"
import type { ToolWarning } from "../../domain/schemas/tool-warnings.js"
import { channelTools } from "../../mcp/tools/channels.js"
import { HulyClient, type HulyClientOperations } from "../client.js"
import { Diagnostics, makeDiagnosticsScope } from "../diagnostics.js"
import { core, gmail } from "../huly-plugins.js"
import { listExternalChannelMessages } from "./external-channel-messages.js"
import type { MetadataClassDoc } from "./sdk-discovery-mappers.js"
import { toRef } from "./sdk-boundary.js"

const decodeParams = Schema.decodeUnknownEither(ListExternalChannelMessagesParamsSchema)
const decodeResult = Schema.decodeUnknownEither(ListExternalChannelMessagesResultSchema)

// SDK brands are erased at runtime, and the SDK does not expose fixture constructors for these identities.
// eslint-disable-next-line no-restricted-syntax -- complete test fixture for an SDK PersonId
const actor = "account:person:test" as PersonId

const gmailModelLayer = (modelSupported: boolean): ReturnType<typeof HulyClient.testLayer> => {
  const modelClass: MetadataClassDoc = {
    _id: toRef<MetadataClassDoc>(gmail.class.Message),
    _class: core.class.Class,
    space: core.space.Model,
    modifiedBy: actor,
    modifiedOn: 0,
    label: "gmail:string:Message",
    kind: 0
  }
  // The complete MetadataClassDoc fixture is selected by both class and _id. The generic SDK port cannot retain
  // that runtime relationship, so this adapter restores the original port only after applying both predicates.
  const findAllInModel: HulyClientOperations["findAllInModel"] = ((classRef: unknown, query: Record<string, unknown>) =>
    Effect.succeed(
      toFindResult(
        modelSupported && classRef === core.class.Class && query["_id"] === gmail.class.Message ? [modelClass] : []
      )
    )) as HulyClientOperations["findAllInModel"]

  return HulyClient.testLayer({ findAllInModel })
}

const runOperation = <A, E>(
  effect: Effect.Effect<A, E, HulyClient | Diagnostics>,
  modelSupported: boolean
): Effect.Effect<{ readonly result: A; readonly warnings: ReadonlyArray<ToolWarning> }, E> =>
  Effect.gen(function* () {
    const diagnostics = yield* makeDiagnosticsScope
    const result = yield* effect.pipe(
      Effect.provide(gmailModelLayer(modelSupported)),
      Effect.provideService(Diagnostics, diagnostics.service)
    )
    return { result, warnings: yield* diagnostics.drainWarnings }
  })

describe("external channel message compatibility", () => {
  it("validates the assessed provider inputs and bounded limit", () => {
    expect(Either.isRight(decodeParams({ provider: "gmail", channel: "inbox@example.com", limit: 200 }))).toBe(true)
    expect(Either.isRight(decodeParams({ provider: "telegram", channel: "Ops" }))).toBe(true)
    expect(Either.isLeft(decodeParams({ provider: "gmail", channel: "Inbox", limit: 201 }))).toBe(true)
    expect(Either.isLeft(decodeParams({ provider: "email", channel: "Inbox" }))).toBe(true)
  })

  it("accepts only the honest unsupported result state", () => {
    expect(
      Either.isRight(
        decodeResult({
          supported: false,
          provider: "gmail",
          channel: "Inbox",
          limit: 5,
          unsupportedReasonCode: "runtime-unverifiable",
          unsupportedReason: "runtime-unverifiable",
          messages: []
        })
      )
    ).toBe(true)
    expect(
      Either.isLeft(decodeResult({ supported: true, provider: "gmail", channel: "Inbox", limit: 5, messages: [] }))
    ).toBe(true)
  })

  it("loads the published Gmail Message runtime class reference", () => {
    expect(String(gmail.class.Message)).toBe("gmail:class:Message")
  })

  it("registers an LLM-readable no-fake-data tool contract", () => {
    const tool = channelTools.find(({ name }) => name === "list_external_channel_messages")

    expect(tool?.inputSchema).toBeDefined()
    expect(tool?.description).toContain("supported=false")
    expect(tool?.description).toContain("live deployment-wide v1/v2 writer version")
    expect(tool?.description).toContain("never sends")
  })

  it.effect("returns supported=false when the Gmail model is unavailable", () =>
    Effect.gen(function* () {
      const { result, warnings } = yield* runOperation(
        listExternalChannelMessages({ provider: "gmail", channel: ChannelIdentifier.make("recipient@example.com") }),
        false
      )

      expect(result.limit).toBe(DEFAULT_EXTERNAL_CHANNEL_MESSAGE_LIMIT)
      expect(result).toMatchObject({ supported: false, provider: "gmail", messages: [] })
      expect(result.unsupportedReason).toContain("model-unavailable")
      expect(result.unsupportedReasonCode).toBe("model-unavailable")
      expect(warnings).toHaveLength(1)
    })
  )

  it.effect("returns supported=false when the installed Gmail model cannot prove the live writer runtime", () =>
    Effect.gen(function* () {
      const { result, warnings } = yield* runOperation(
        listExternalChannelMessages({
          provider: "gmail",
          channel: ChannelIdentifier.make("email-channel-1"),
          limit: 5
        }),
        true
      )

      expect(result).toMatchObject({ supported: false, provider: "gmail", limit: 5, messages: [] })
      expect(result.unsupportedReason).toContain("runtime-unverifiable")
      expect(result.unsupportedReasonCode).toBe("runtime-unverifiable")
      expect(warnings[0]?.code).toBe("external_channel_runtime_unsupported")
    })
  )

  it.effect("keeps Telegram explicitly unsupported without synthetic warnings", () =>
    Effect.gen(function* () {
      const { result, warnings } = yield* runOperation(
        listExternalChannelMessages({ provider: "telegram", channel: ChannelIdentifier.make("Ops") }),
        true
      )

      expect(result).toMatchObject({ supported: false, provider: "telegram", channel: "Ops", messages: [] })
      expect(result.unsupportedReason).toContain("package-incompatible")
      expect(result.unsupportedReasonCode).toBe("package-incompatible")
      expect(warnings).toEqual([])
    })
  )
})
