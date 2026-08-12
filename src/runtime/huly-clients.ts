import { type Cause, Context, Effect, Exit, Layer, Scope } from "effect"

import { HulyConfigService } from "../config/config.js"
import { HulyClient } from "../huly/client.js"
import { HulyUnavailableError } from "../huly/errors-base.js"
import { HulyStorageClient } from "../huly/storage.js"
import { WorkspaceClient } from "../huly/workspace-client.js"
import { findRecoverableCauseFailure } from "./cause-exit.js"
import type { ClientBundle, ClientResolver, HulyClientBundleError } from "./client-resolver.js"

export type { ClientBundle, ClientResolver, HulyClientBundleError } from "./client-resolver.js"

export type CombinedClientLayer = Layer.Layer<
  HulyClient | HulyStorageClient | WorkspaceClient,
  HulyClientBundleError,
  never
>

/**
 * Build the combined client layer (not yet evaluated — deferred until first use).
 */
export const buildCombinedClientLayer = (): CombinedClientLayer => {
  const configLayer = HulyConfigService.layer

  const hulyClientLayer = HulyClient.layer.pipe(Layer.provide(configLayer))

  const storageClientLayer = HulyStorageClient.layer.pipe(Layer.provide(configLayer))

  const workspaceClientLayer = WorkspaceClient.layer.pipe(Layer.provide(configLayer))

  return Layer.merge(Layer.merge(hulyClientLayer, storageClientLayer), workspaceClientLayer)
}

export const buildScopedClientBundle = (
  combinedClientLayer: CombinedClientLayer
): Effect.Effect<{ readonly bundle: ClientBundle; readonly close: () => Promise<void> }, HulyClientBundleError> =>
  Effect.gen(function* () {
    const scope = yield* Scope.make()
    let closePromise: Promise<void> | undefined
    const close = (): Promise<void> => {
      closePromise ??= Effect.runPromise(Scope.close(scope, Exit.void))
      return closePromise
    }
    const ctx = yield* Layer.buildWithScope(combinedClientLayer, scope).pipe(
      Effect.tapCause((cause) => Scope.close(scope, Exit.failCause(cause)))
    )
    return {
      bundle: {
        hulyClient: Context.get(ctx, HulyClient),
        storageClient: Context.get(ctx, HulyStorageClient),
        workspaceClient: Context.get(ctx, WorkspaceClient)
      },
      close
    }
  })

export const isRecoverableClientUnavailableCause = (cause: Cause.Cause<HulyClientBundleError>): boolean =>
  findRecoverableCauseFailure(
    cause,
    (failure): failure is HulyUnavailableError => failure instanceof HulyUnavailableError
  ) !== undefined

/**
 * Create a memoized client resolver that builds layers on first call
 * and keeps the scope alive for the process lifetime.
 * Returns [resolver, prime, close]. The close handle releases any bundle owned
 * by this resolver; prime replaces owned state with an externally owned bundle.
 */
export const createClientResolver = (
  combinedClientLayer: CombinedClientLayer
): readonly [resolve: ClientResolver, prime: (bundle: ClientBundle) => Promise<void>, close: () => Promise<void>] => {
  let clientsPromise: Promise<Exit.Exit<ClientBundle, HulyClientBundleError>> | null = null
  let ownedAcquisition: {
    readonly abort: () => void
    readonly promise: Promise<
      Exit.Exit<{ readonly bundle: ClientBundle; readonly close: () => Promise<void> }, HulyClientBundleError>
    >
  } | null = null
  let resolverClosed = false
  let resolverClosePromise: Promise<void> | undefined

  const releaseAcquisition = async (acquisition: NonNullable<typeof ownedAcquisition>): Promise<void> => {
    acquisition.abort()
    const exit = await acquisition.promise
    if (Exit.isSuccess(exit)) await exit.value.close()
  }

  const resolve = (): Promise<Exit.Exit<ClientBundle, HulyClientBundleError>> => {
    if (resolverClosed) {
      return Promise.resolve(Exit.die(new Error("Process-scoped Huly clients are already closed")))
    }
    if (clientsPromise === null) {
      const controller = new AbortController()
      const acquisition = Effect.runPromiseExit(buildScopedClientBundle(combinedClientLayer), {
        signal: controller.signal
      })
      const currentAcquisition = { abort: () => controller.abort(), promise: acquisition }
      const resolvedClients = acquisition.then((exit) =>
        Exit.isSuccess(exit) ? Exit.succeed(exit.value.bundle) : Exit.failCause(exit.cause)
      )
      ownedAcquisition = currentAcquisition
      clientsPromise = resolvedClients
      void acquisition.then((exit) => {
        if (
          Exit.isFailure(exit) &&
          isRecoverableClientUnavailableCause(exit.cause) &&
          clientsPromise === resolvedClients
        ) {
          clientsPromise = null
          if (ownedAcquisition === currentAcquisition) ownedAcquisition = null
        }
      })
    }
    return clientsPromise
  }

  const prime = async (bundle: ClientBundle): Promise<void> => {
    if (resolverClosed) return
    const previouslyOwned = ownedAcquisition
    ownedAcquisition = null
    clientsPromise = Promise.resolve(Exit.succeed(bundle))
    if (previouslyOwned !== null) await releaseAcquisition(previouslyOwned)
  }

  const close = (): Promise<void> => {
    if (resolverClosePromise !== undefined) return resolverClosePromise
    resolverClosed = true
    const owned = ownedAcquisition
    ownedAcquisition = null
    clientsPromise = null
    resolverClosePromise = owned === null ? Promise.resolve() : releaseAcquisition(owned)
    return resolverClosePromise
  }

  return [resolve, prime, close] as const
}
