import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { acquireClosableClient } from "../../src/huly/scoped-client.js"

describe("scoped Huly transaction client", () => {
  it("closes the acquired client exactly once when its scope closes", async () => {
    let closes = 0
    const client = {
      close: async () => {
        closes++
      }
    }

    const acquired = await Effect.runPromise(
      acquireClosableClient(Effect.succeed({ client })).pipe(
        Effect.tap(({ client: scopedClient }) => Effect.sync(() => expect(scopedClient).toBe(client))),
        Effect.scoped
      )
    )

    expect(acquired.client).toBe(client)
    expect(closes).toBe(1)
  })
})
