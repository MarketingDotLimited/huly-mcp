import { Result, Schema } from "effect"
import { describe, expect, it } from "vitest"

import { UpdatePersonChannelParamsSchema } from "../../src/domain/schemas/contact-channels.js"

describe("contact channel schemas", () => {
  const decodeUpdate = Schema.decodeUnknownResult(UpdatePersonChannelParamsSchema)

  it("accepts channel-id and non-email provider locators", () => {
    expect(
      Result.isSuccess(decodeUpdate({ person: "person-1", channelId: "channel-1", newValue: "+1 555 0100" }))
    ).toBe(true)
    expect(
      Result.isSuccess(
        decodeUpdate({ person: "person-1", provider: "phone", value: "+1 555 0100", newValue: "+1 555 0101" })
      )
    ).toBe(true)
  })
})
