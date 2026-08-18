import { Effect, Exit, Layer, Redacted } from "effect"
import { describe, expect, it } from "vitest"

import { HulyConfigService } from "../../src/config/config.js"
import { HulyClient } from "../../src/huly/client.js"
import { HulyConnectionError } from "../../src/huly/errors.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import { buildScopedClientBundle } from "../../src/runtime/huly-clients.js"
import {
  createClientLeaseResolver,
  createHttpClientLeaseResolver,
  createPrimingClientLeaseResolver
} from "../../src/runtime/http-client-leases.js"

const activeSignal = (): AbortSignal => new AbortController().signal

const baseClientLayer = Layer.merge(
  Layer.merge(HulyClient.testLayer({}), HulyStorageClient.testLayer({})),
  WorkspaceClient.testLayer({})
)

const requestWithConfig = (workspace: string, token: string): Request =>
  new Request("http://localhost/mcp", {
    headers: { "x-huly-url": "https://huly.app", "x-huly-workspace": workspace, "x-huly-token": token }
  })

describe("HTTP client lease resolution", () => {
  it("owns and interrupts isolated resource-discovery leases", async () => {
    const resolveLease = createClientLeaseResolver(baseClientLayer)
    const lease = await resolveLease(new AbortController().signal)
    expect(Exit.isSuccess(lease.bundle)).toBe(true)
    await lease.close()

    const pendingLayer = baseClientLayer.pipe(Layer.tap(() => Effect.never))
    const pendingResolver = createClientLeaseResolver(pendingLayer)
    const cancellation = new AbortController()
    const pending = pendingResolver(cancellation.signal)
    cancellation.abort()
    await expect(pending).rejects.toThrow("resource discovery client acquisition was interrupted")

    const failedLayer = Layer.merge(
      Layer.merge(
        Layer.effect(HulyClient, Effect.fail(new HulyConnectionError({ message: "isolated client failed" }))),
        HulyStorageClient.testLayer({})
      ),
      WorkspaceClient.testLayer({})
    )
    const failed = await createClientLeaseResolver(failedLayer)(new AbortController().signal)
    expect(Exit.isFailure(failed.bundle)).toBe(true)
    await failed.close()
  })

  it("transfers a successful discovery lease to the process resolver", async () => {
    let releases = 0
    let closePrimed: (() => Promise<void>) | undefined
    const trackedLayer = baseClientLayer.pipe(Layer.tap(() => Effect.addFinalizer(() => Effect.sync(() => releases++))))
    const resolveLease = createPrimingClientLeaseResolver(trackedLayer, async (scoped) => {
      closePrimed = scoped.close
    })

    const lease = await resolveLease(new AbortController().signal)

    expect(Exit.isSuccess(lease.bundle)).toBe(true)
    await lease.close()
    expect(releases).toBe(0)
    expect(closePrimed).toBeDefined()
    await closePrimed?.()
    expect(releases).toBe(1)
  })

  it("releases discovery leases when process priming fails", async () => {
    let releases = 0
    const trackedLayer = baseClientLayer.pipe(Layer.tap(() => Effect.addFinalizer(() => Effect.sync(() => releases++))))
    const resolveLease = createPrimingClientLeaseResolver(trackedLayer, async () => {
      throw new Error("prime failed")
    })

    await expect(resolveLease(new AbortController().signal)).rejects.toThrow("prime failed")
    expect(releases).toBe(1)
  })

  it("preserves typed acquisition failures without priming", async () => {
    let primed = false
    const failedLayer = Layer.merge(
      Layer.merge(
        Layer.effect(HulyClient, Effect.fail(new HulyConnectionError({ message: "prime acquisition failed" }))),
        HulyStorageClient.testLayer({})
      ),
      WorkspaceClient.testLayer({})
    )
    const resolveLease = createPrimingClientLeaseResolver(failedLayer, async () => {
      primed = true
    })

    const lease = await resolveLease(new AbortController().signal)

    expect(Exit.isFailure(lease.bundle)).toBe(true)
    expect(primed).toBe(false)
    await lease.close()
  })

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

    const first = await resolveLease(requestWithConfig("workspace-a", "token-a"), activeSignal())
    const second = await resolveLease(requestWithConfig("workspace-b", "token-b"), activeSignal())

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
      const lease = await resolveLease(new Request("http://localhost/mcp"), activeSignal())

      expect(Exit.isSuccess(lease.bundle) && lease.bundle.value).toBe(scoped.bundle)
      expect(envResolutions).toBe(1)
      await lease.close()
    } finally {
      await scoped.close()
    }
  })

  it("returns typed failures for invalid headers and scoped client acquisition", async () => {
    const resolveEnvClients = async () => Exit.die(new Error("env resolver must not run"))
    const invalidHeaders = createHttpClientLeaseResolver(baseClientLayer, resolveEnvClients)
    const invalid = await invalidHeaders(
      new Request("http://localhost/mcp", { headers: { "x-huly-url": "not-a-url" } }),
      activeSignal()
    )
    const failedClientLayer = Layer.merge(
      Layer.merge(
        Layer.effect(HulyClient, Effect.fail(new HulyConnectionError({ message: "client failed" }))),
        HulyStorageClient.testLayer({})
      ),
      WorkspaceClient.testLayer({})
    )
    const failedClient = await createHttpClientLeaseResolver(failedClientLayer, resolveEnvClients)(
      requestWithConfig("workspace-a", "token-a"),
      activeSignal()
    )

    expect(Exit.isFailure(invalid.bundle)).toBe(true)
    expect(Exit.isFailure(failedClient.bundle)).toBe(true)
    await invalid.close()
    await failedClient.close()
  })

  it("interrupts request-scoped acquisition when the request is canceled", async () => {
    const controller = new AbortController()
    controller.abort()
    const resolveLease = createHttpClientLeaseResolver(baseClientLayer, async () =>
      Exit.die(new Error("env resolver must not run"))
    )

    await expect(resolveLease(requestWithConfig("workspace-a", "token-a"), controller.signal)).rejects.toThrow(
      "interrupted"
    )
  })
})
