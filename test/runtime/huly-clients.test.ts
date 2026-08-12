import { Cause, Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"

import { HulyClient } from "../../src/huly/client.js"
import { HulyConnectionError, HulyUnavailableError } from "../../src/huly/errors.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { normalizeHulyOrigin } from "../../src/huly/unavailable-diagnostics.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import { buildClientBundle, buildScopedClientBundle, createClientResolver } from "../../src/runtime/huly-clients.js"

const clientLayer = Layer.merge(
  Layer.merge(HulyClient.testLayer({}), HulyStorageClient.testLayer({})),
  WorkspaceClient.testLayer({})
)

describe("shared Huly client runtime", () => {
  it("builds scoped client bundles from supplied layers", async () => {
    const scoped = await Effect.runPromise(buildScopedClientBundle(clientLayer))

    try {
      expect(scoped.bundle.storageClient.getFileUrl("blob-1")).toContain("blob-1")
      if (scoped.bundle.workspaceClient === undefined) {
        throw new Error("Expected workspace client in scoped bundle")
      }
      if (scoped.bundle.storageClient.downloadFile === undefined) {
        throw new Error("Expected storage client download support")
      }
      expect(await Effect.runPromise(scoped.bundle.storageClient.downloadFile("blob-1"))).toEqual(
        Buffer.from("test file blob-1")
      )
      expect(await Effect.runPromise(scoped.bundle.workspaceClient.getUserWorkspaces())).toEqual([])
    } finally {
      await scoped.close()
    }
  })

  it("memoizes resolver construction and supports primed bundles", async () => {
    const [resolve] = createClientResolver(clientLayer)

    const first = await resolve()
    const second = await resolve()

    expect(second).toBe(first)
    expect(Exit.isSuccess(first)).toBe(true)

    const primedBundle = await Effect.runPromise(buildClientBundle(clientLayer))
    const [resolvePrimed, prime] = createClientResolver(clientLayer)
    prime(primedBundle)

    const primed = await resolvePrimed()
    expect(Exit.isSuccess(primed) && primed.value).toBe(primedBundle)
  })

  it("evicts a mixed acquisition containing unavailability so a later call can recover", async () => {
    let available = false
    const unavailable = new HulyUnavailableError({
      endpointOrigin: normalizeHulyOrigin("https://huly.app"),
      failureKind: "refused"
    })
    const recoverableLayer = Layer.suspend(() =>
      available
        ? clientLayer
        : clientLayer.pipe(
            Layer.tap(() =>
              Effect.failCause(
                Cause.combine(Cause.fail(new HulyConnectionError({ message: "connection" })), Cause.fail(unavailable))
              )
            )
          )
    )
    const [resolve] = createClientResolver(recoverableLayer)

    expect(Exit.isFailure(await resolve())).toBe(true)
    available = true
    expect(Exit.isSuccess(await resolve())).toBe(true)
  })

  it("does not evict a newer primed bundle after an unavailable acquisition fails", async () => {
    const unavailable = new HulyUnavailableError({
      endpointOrigin: normalizeHulyOrigin("https://huly.app"),
      failureKind: "refused"
    })
    const failingLayer = clientLayer.pipe(Layer.tap(() => Effect.fail(unavailable)))
    const [resolve, prime] = createClientResolver(failingLayer)
    const primedBundle = await Effect.runPromise(buildClientBundle(clientLayer))
    const failedAcquisition = resolve()
    prime(primedBundle)

    expect(Exit.isFailure(await failedAcquisition)).toBe(true)
    const primed = await resolve()
    expect(Exit.isSuccess(primed) && primed.value).toBe(primedBundle)
  })

  it("keeps non-unavailable failures cached", async () => {
    let acquisitions = 0
    const failingLayer = Layer.suspend(() => {
      acquisitions += 1
      return clientLayer.pipe(Layer.tap(() => Effect.fail(new HulyConnectionError({ message: "stable failure" }))))
    })
    const [resolve] = createClientResolver(failingLayer)

    const first = await resolve()
    const second = await resolve()

    expect(Exit.isFailure(first)).toBe(true)
    expect(second).toBe(first)
    expect(acquisitions).toBe(1)
  })

  it("does not evict an unavailable failure mixed with a defect", async () => {
    let acquisitions = 0
    const unavailable = new HulyUnavailableError({
      endpointOrigin: normalizeHulyOrigin("https://huly.app"),
      failureKind: "refused"
    })
    const failingLayer = Layer.suspend(() => {
      acquisitions += 1
      return clientLayer.pipe(
        Layer.tap(() => Effect.failCause(Cause.combine(Cause.fail(unavailable), Cause.die("token=secret"))))
      )
    })
    const [resolve] = createClientResolver(failingLayer)

    const first = await resolve()
    const second = await resolve()

    expect(Exit.isFailure(first)).toBe(true)
    expect(second).toBe(first)
    expect(acquisitions).toBe(1)
  })
})
