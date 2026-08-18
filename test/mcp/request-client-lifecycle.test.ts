import { describe, expect, it } from "vitest"

import { createRequestClientLifecycle, type RequestClientLease } from "../../src/mcp/request-client-lifecycle.js"

const bundle = Symbol("request-client-bundle")

const deferred = <A>(): { readonly promise: Promise<A>; readonly resolve: (value: A) => void } => {
  let complete: ((value: A) => void) | undefined
  const promise = new Promise<A>((resolve) => {
    complete = resolve
  })
  return { promise, resolve: (value) => complete?.(value) }
}

describe("request-scoped Huly client lifecycle", () => {
  it("acquires lazily once and releases exactly once", async () => {
    let acquired = 0
    let released = 0
    const lifecycle = createRequestClientLifecycle(async () => {
      acquired++
      return {
        bundle,
        close: () => {
          released++
        }
      }
    })

    expect(await lifecycle.resolve()).toBe(bundle)
    expect(await lifecycle.resolve()).toBe(bundle)
    await lifecycle.close()
    await lifecycle.close()

    expect({ acquired, released }).toEqual({ acquired: 1, released: 1 })
  })

  it("closes an unused lifecycle without acquiring and rejects later resolution", async () => {
    let acquired = 0
    const lifecycle = createRequestClientLifecycle(async () => {
      acquired++
      return { bundle, close: () => {} }
    })

    await lifecycle.close()
    await expect(lifecycle.resolve()).rejects.toThrow("already closed")
    expect(acquired).toBe(0)
  })

  it("does not release when acquisition rejects", async () => {
    const lifecycle = createRequestClientLifecycle<symbol>(() => Promise.reject(new Error("acquisition failed")))

    await expect(lifecycle.resolve()).rejects.toThrow("acquisition failed")
    await expect(lifecycle.close()).resolves.toBeUndefined()
  })

  it("releases a pending acquisition when close wins the race", async () => {
    const acquired = deferred<RequestClientLease<symbol>>()
    let released = 0
    const lifecycle = createRequestClientLifecycle(() => acquired.promise)
    const resolving = lifecycle.resolve()
    const closing = lifecycle.close()

    acquired.resolve({
      bundle,
      close: () => {
        released++
      }
    })

    await expect(resolving).rejects.toThrow("closed during acquisition")
    await expect(closing).resolves.toBeUndefined()
    expect(released).toBe(1)
  })

  it("surfaces asynchronous lease cleanup failures", async () => {
    const lifecycle = createRequestClientLifecycle(async () => ({
      bundle,
      close: () => Promise.reject(new Error("cleanup failed"))
    }))

    await lifecycle.resolve()
    await expect(lifecycle.close()).rejects.toThrow("cleanup failed")
  })
})
