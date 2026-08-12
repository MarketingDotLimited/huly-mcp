import { Effect, Exit, Layer, Redacted } from "effect"
import { describe, expect, it } from "vitest"

import { HulyConfigService } from "../../src/config/config.js"
import { HulyClient } from "../../src/huly/client.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import { buildScopedClientBundle } from "../../src/runtime/huly-clients.js"
import { createHttpClientLeaseResolver } from "../../src/runtime/http-client-leases.js"

const baseClientLayer = Layer.merge(
  Layer.merge(HulyClient.testLayer({}), HulyStorageClient.testLayer({})),
  WorkspaceClient.testLayer({})
)

const requestWithConfig = (workspace: string, token: string): Request =>
  new Request("http://localhost/mcp", {
    headers: { "x-huly-url": "https://huly.app", "x-huly-workspace": workspace, "x-huly-token": token }
  })

describe("HTTP client lease resolution", () => {
  it("isolates header configuration and releases each request-owned bundle", async () => {
    const acquisitions: Array<{ readonly workspace: string; readonly expectedToken: boolean }> = []
    let releases = 0
    let envResolutions = 0
    const trackedLayer = baseClientLayer.pipe(
      Layer.tap(() =>
        Effect.gen(function* () {
          const config = yield* HulyConfigService
          acquisitions.push({
            workspace: config.workspace,
            expectedToken:
              config.auth._tag === "token" &&
              Redacted.value(config.auth.token) === `token-${config.workspace.slice(-1)}`
          })
          yield* Effect.addFinalizer(() => Effect.sync(() => releases++))
        })
      ),
      Layer.provide(HulyConfigService.layer)
    )
    const resolveEnvClients = async () => {
      envResolutions++
      return Exit.die(new Error("env resolver must not serve header-configured requests"))
    }
    const resolveLease = createHttpClientLeaseResolver(trackedLayer, resolveEnvClients)

    const first = await resolveLease(requestWithConfig("workspace-a", "token-a"))
    const second = await resolveLease(requestWithConfig("workspace-b", "token-b"))

    expect(Exit.isSuccess(first.bundle)).toBe(true)
    expect(Exit.isSuccess(second.bundle)).toBe(true)
    expect(acquisitions).toEqual([
      { workspace: "workspace-a", expectedToken: true },
      { workspace: "workspace-b", expectedToken: true }
    ])
    expect(envResolutions).toBe(0)
    expect(releases).toBe(0)

    await first.close()
    await second.close()
    expect(releases).toBe(2)
  })

  it("delegates requests without Huly headers to the process resolver", async () => {
    const scoped = await Effect.runPromise(buildScopedClientBundle(baseClientLayer))
    let envResolutions = 0
    const resolveLease = createHttpClientLeaseResolver(baseClientLayer, async () => {
      envResolutions++
      return Exit.succeed(scoped.bundle)
    })

    try {
      const lease = await resolveLease(new Request("http://localhost/mcp"))

      expect(Exit.isSuccess(lease.bundle) && lease.bundle.value).toBe(scoped.bundle)
      expect(envResolutions).toBe(1)
      await lease.close()
    } finally {
      await scoped.close()
    }
  })
})
