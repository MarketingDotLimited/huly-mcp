import type { Server } from "@modelcontextprotocol/server"

import type { ClientBundle } from "./protocol-handlers.js"

export interface RequestClientLease<A = ClientBundle> {
  readonly bundle: A
  readonly close: () => void | Promise<void>
}

export interface RequestClientLifecycle<A = ClientBundle> {
  readonly resolve: () => Promise<A>
  readonly close: () => Promise<void>
}

export type RequestClientCleanupErrorHandler = (error: Error) => void

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

/**
 * Binds request-client cleanup to the SDK-owned server lifecycle while
 * preserving any pre-existing close observer.
 */
export const attachRequestClientLifecycle = <A>(
  server: Server,
  lifecycle: RequestClientLifecycle<A>,
  onCleanupError: RequestClientCleanupErrorHandler
): void => {
  const previousOnClose = server.onclose
  const originalClose = server.close.bind(server)
  let serverClosePromise: Promise<void> | undefined
  const reportCleanupError = (error: unknown): void => {
    onCleanupError(error instanceof Error ? error : new Error(String(error)))
  }

  server.onclose = () => {
    void lifecycle.close().catch(reportCleanupError)
    previousOnClose?.()
  }
  server.close = () => {
    serverClosePromise ??= Promise.allSettled([originalClose(), lifecycle.close()]).then(
      ([serverResult, lifecycleResult]) => {
        if (serverResult.status === "rejected" && lifecycleResult.status === "rejected") {
          throw new AggregateError(
            [serverResult.reason, lifecycleResult.reason],
            "MCP server and request-client cleanup both failed"
          )
        }
        if (serverResult.status === "rejected") throw serverResult.reason
        if (lifecycleResult.status === "rejected") throw lifecycleResult.reason
      }
    )
    return serverClosePromise
  }
}
