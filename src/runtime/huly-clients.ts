import { type Cause, Context, Effect, Exit, Layer, Scope } from "effect"

import { HulyConfigService } from "../config/config.js"
import { HulyClient } from "../huly/client.js"
import { HulyUnavailableError } from "../huly/errors.js"
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

export const buildClientBundle = (
  combinedClientLayer: CombinedClientLayer
): Effect.Effect<ClientBundle, HulyClientBundleError> =>
  buildScopedClientBundle(combinedClientLayer).pipe(Effect.map(({ bundle }) => bundle))

export const buildScopedClientBundle = (
  combinedClientLayer: CombinedClientLayer
): Effect.Effect<{ readonly bundle: ClientBundle; readonly close: () => Promise<void> }, HulyClientBundleError> =>
  Effect.gen(function* () {
    const scope = yield* Scope.make()
    const close = (): Promise<void> => Effect.runPromise(Scope.close(scope, Exit.void))
    const ctx = yield* Layer.buildWithScope(combinedClientLayer, scope).pipe(
      Effect.tapError(() => Scope.close(scope, Exit.void))
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

const isUnavailableCause = (cause: Cause.Cause<HulyClientBundleError>): boolean =>
  findRecoverableCauseFailure(
    cause,
    (failure): failure is HulyUnavailableError => failure instanceof HulyUnavailableError
  ) !== undefined

/**
 * Create a memoized client resolver that builds layers on first call
 * and keeps the scope alive for the process lifetime.
 * Returns [resolver, prime] — prime pre-populates the cache from an existing bundle.
 */
export const createClientResolver = (
  combinedClientLayer: CombinedClientLayer
): readonly [resolve: ClientResolver, prime: (bundle: ClientBundle) => void] => {
  let clientsPromise: Promise<Exit.Exit<ClientBundle, HulyClientBundleError>> | null = null

  const resolve = (): Promise<Exit.Exit<ClientBundle, HulyClientBundleError>> => {
    if (clientsPromise === null) {
      const acquisition = Effect.runPromiseExit(buildClientBundle(combinedClientLayer))
      clientsPromise = acquisition
      void acquisition.then((exit) => {
        if (Exit.isFailure(exit) && isUnavailableCause(exit.cause) && clientsPromise === acquisition) {
          clientsPromise = null
        }
      })
    }
    return clientsPromise
  }

  const prime = (bundle: ClientBundle): void => {
    clientsPromise = Promise.resolve(Exit.succeed(bundle))
  }

  return [resolve, prime] as const
}
