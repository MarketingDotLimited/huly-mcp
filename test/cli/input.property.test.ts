import { NodeContext } from "@effect/platform-node"
import { Effect } from "effect"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { cliCommandCatalog } from "../../packages/huly-cli/src/catalog.js"
import { parseCliCommandLine } from "../../packages/huly-cli/src/cli-options.js"
import { buildCliInvocation } from "../../packages/huly-cli/src/input.js"
import { operationRegistry } from "../../src/mcp/tools/index.js"

describe("CLI input precedence properties", () => {
  it("always gives an explicit scalar flag precedence over JSON sources", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string(),
        fc.string().filter((value) => !value.startsWith("{") && !value.startsWith("[")),
        async (jsonTitle, explicitTitle) => {
          const operation = operationRegistry.getOperation("update_issue")
          const raw = ["HULY", "HULY-1", "--input-json", JSON.stringify({ title: jsonTitle }), "--title", explicitTitle]
          const invocation = await Effect.runPromise(
            Effect.gen(function* () {
              const parsed = yield* parseCliCommandLine(operation, cliCommandCatalog.update_issue, raw)
              return yield* buildCliInvocation(operation, cliCommandCatalog.update_issue, parsed)
            }).pipe(Effect.provide(NodeContext.layer))
          )

          expect(invocation.input).toMatchObject({ project: "HULY", identifier: "HULY-1", title: explicitTitle })
        }
      )
    )
  })
})
