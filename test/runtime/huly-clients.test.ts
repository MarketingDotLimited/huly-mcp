import { Cause, Deferred, Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"

import { HulyClient } from "../../src/huly/client.js"
import { HulyConnectionError, HulyUnavailableError } from "../../src/huly/errors-base.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { normalizeHulyOrigin } from "../../src/huly/unavailable-diagnostics.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import { buildScopedClientBundle, createClientResolver } from "../../src/runtime/huly-clients.js"

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

  it("memoizes one acquisition and closes its owned scope exactly once", async () => {
    let acquisitions = 0
    let releases = 0
    const trackedLayer = Layer.suspend(() => {
      acquisitions += 1
      return clientLayer.pipe(Layer.tap(() => Effect.addFinalizer(() => Effect.sync(() => releases++))))
    })
    const [resolve, , close] = createClientResolver(trackedLayer)

    const first = await resolve()
    const second = await resolve()

    expect(second).toBe(first)
    expect(Exit.isSuccess(first)).toBe(true)
    expect(acquisitions).toBe(1)

    await close()
    await close()
    expect(releases).toBe(1)
    expect(Exit.isFailure(await resolve())).toBe(true)
  })

  it("supports externally owned primed bundles without closing them", async () => {
    const scoped = await Effect.runPromise(buildScopedClientBundle(clientLayer))
    const [resolve, prime, close] = createClientResolver(clientLayer)
    await prime(scoped.bundle)

    try {
      const primed = await resolve()
      expect(Exit.isSuccess(primed) && primed.value).toBe(scoped.bundle)
      await close()

      expect(scoped.bundle.storageClient.getFileUrl("still-open")).toContain("still-open")
    } finally {
      await scoped.close()
    }
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
    const [resolve, , close] = createClientResolver(recoverableLayer)

    try {
      expect(Exit.isFailure(await resolve())).toBe(true)
      available = true
      expect(Exit.isSuccess(await resolve())).toBe(true)
    } finally {
      await close()
    }
  })

  it("does not evict a newer primed bundle after an unavailable acquisition fails", async () => {
    const unavailable = new HulyUnavailableError({
      endpointOrigin: normalizeHulyOrigin("https://huly.app"),
      failureKind: "refused"
    })
    const failingLayer = clientLayer.pipe(Layer.tap(() => Effect.fail(unavailable)))
    const [resolve, prime, close] = createClientResolver(failingLayer)
    const scoped = await Effect.runPromise(buildScopedClientBundle(clientLayer))
    const failedAcquisition = resolve()
    await prime(scoped.bundle)

    try {
      expect(Exit.isFailure(await failedAcquisition)).toBe(true)
      const primed = await resolve()
      expect(Exit.isSuccess(primed) && primed.value).toBe(scoped.bundle)
    } finally {
      await close()
      await scoped.close()
    }
  })

  it("keeps non-unavailable failures cached", async () => {
    let acquisitions = 0
    const failingLayer = Layer.suspend(() => {
      acquisitions += 1
      return clientLayer.pipe(Layer.tap(() => Effect.fail(new HulyConnectionError({ message: "stable failure" }))))
    })
    const [resolve, , close] = createClientResolver(failingLayer)

    const first = await resolve()
    const second = await resolve()

    expect(Exit.isFailure(first)).toBe(true)
    expect(second).toBe(first)
    expect(acquisitions).toBe(1)
    await close()
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
    const [resolve, , close] = createClientResolver(failingLayer)

    const first = await resolve()
    const second = await resolve()

    expect(Exit.isFailure(first)).toBe(true)
    expect(second).toBe(first)
    expect(acquisitions).toBe(1)
    await close()
  })

  it("interrupts and awaits a pending acquisition when closed", async () => {
    const started = await Effect.runPromise(Deferred.make<void>())
    const interrupted = await Effect.runPromise(Deferred.make<void>())
    const pendingLayer = clientLayer.pipe(
      Layer.tap(() =>
        Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined))
        )
      )
    )
    const [resolve, , close] = createClientResolver(pendingLayer)
    const pendingResolution = resolve()

    await Effect.runPromise(Deferred.await(started))
    await close()

    expect(await Effect.runPromise(Deferred.await(interrupted))).toBeUndefined()
    expect(Exit.isFailure(await pendingResolution)).toBe(true)
  })

  it("interrupts and awaits a pending owned acquisition before priming", async () => {
    const started = await Effect.runPromise(Deferred.make<void>())
    const interrupted = await Effect.runPromise(Deferred.make<void>())
    const pendingLayer = clientLayer.pipe(
      Layer.tap(() =>
        Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined))
        )
      )
    )
    const scoped = await Effect.runPromise(buildScopedClientBundle(clientLayer))
    const [resolve, prime, close] = createClientResolver(pendingLayer)
    const pendingResolution = resolve()

    try {
      await Effect.runPromise(Deferred.await(started))
      await prime(scoped.bundle)

      expect(await Effect.runPromise(Deferred.await(interrupted))).toBeUndefined()
      expect(Exit.isFailure(await pendingResolution)).toBe(true)
      const primed = await resolve()
      expect(Exit.isSuccess(primed) && primed.value).toBe(scoped.bundle)
    } finally {
      await close()
      await scoped.close()
    }
  })
})
