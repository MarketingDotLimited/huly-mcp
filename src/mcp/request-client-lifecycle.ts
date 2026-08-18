import type { ClientBundle } from "../runtime/client-resolver.js"

export interface RequestClientLease<A = ClientBundle> {
  readonly bundle: A
  readonly close: () => void | Promise<void>
}

export interface RequestClientLifecycle<A = ClientBundle> {
  readonly resolve: () => Promise<A>
  readonly close: () => Promise<void>
}

/**
 * Lazily acquires at most one request-scoped Huly client bundle and releases it
 * exactly once. Closing an unused lifecycle is intentionally a no-op.
 */
export const createRequestClientLifecycle = <A>(
  acquire: () => Promise<RequestClientLease<A>>
): RequestClientLifecycle<A> => {
  let leasePromise: Promise<RequestClientLease<A>> | undefined
  let closed = false
  let closePromise: Promise<void> | undefined

  const resolve = async (): Promise<A> => {
    if (closed) throw new Error("Request-scoped Huly clients are already closed")
    leasePromise ??= acquire()
    const lease = await leasePromise
    if (closed) {
      await closePromise
      throw new Error("Request-scoped Huly clients were closed during acquisition")
    }
    return lease.bundle
  }

  const close = (): Promise<void> => {
    if (closePromise !== undefined) return closePromise
    closed = true
    const pending = leasePromise
    closePromise =
      pending === undefined
        ? Promise.resolve()
        : pending.then(
            async (lease) => {
              await lease.close()
            },
            () => {
              // A failed acquisition has no acquired resource to release.
            }
          )
    return closePromise
  }

  return { resolve, close }
}
