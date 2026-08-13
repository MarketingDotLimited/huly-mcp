import { type Cause, Context, Effect, Exit, Fiber, Layer, Scope } from "effect"

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

export interface ScopedClientBundle {
  readonly bundle: ClientBundle
  readonly close: () => Promise<void>
}

export interface ProcessClientResolver {
  readonly resolve: ClientResolver
  readonly prime: (scoped: ScopedClientBundle) => Promise<void>
  readonly close: () => Promise<void>
}

interface ClientAcquisition {
  readonly result: Promise<Exit.Exit<ScopedClientBundle, HulyClientBundleError>>
  readonly close: () => Promise<void>
}

interface ActiveClientAcquisition {
  readonly acquisition: ClientAcquisition
  readonly clients: Promise<Exit.Exit<ClientBundle, HulyClientBundleError>>
}

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

const makeScopeClose = (scope: Scope.Closeable): (() => Promise<void>) => {
  const state: { promise: Promise<void> | undefined } = { promise: undefined }
  return () => {
    state.promise ??= Effect.runPromise(Scope.close(scope, Exit.void))
    return state.promise
  }
}

export const buildScopedClientBundle = (
  combinedClientLayer: CombinedClientLayer
): Effect.Effect<ScopedClientBundle, HulyClientBundleError> =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const scope = yield* Scope.make()
      const ctx = yield* restore(Layer.buildWithScope(combinedClientLayer, scope)).pipe(
        Effect.onExit((exit) => (Exit.isFailure(exit) ? Scope.close(scope, exit) : Effect.void))
      )
      return {
        bundle: {
          hulyClient: Context.get(ctx, HulyClient),
          storageClient: Context.get(ctx, HulyStorageClient),
          workspaceClient: Context.get(ctx, WorkspaceClient)
        },
        close: makeScopeClose(scope)
      }
    })
  )

export const isRecoverableClientUnavailableCause = (cause: Cause.Cause<HulyClientBundleError>): boolean =>
  findRecoverableCauseFailure(
    cause,
    (failure): failure is HulyUnavailableError => failure instanceof HulyUnavailableError
  ) !== undefined

const startClientAcquisition = (combinedClientLayer: CombinedClientLayer): ClientAcquisition => {
  const fiber = Effect.runFork(buildScopedClientBundle(combinedClientLayer))
  const result = Effect.runPromise(Fiber.await(fiber))
  const state: { closePromise: Promise<void> | undefined } = { closePromise: undefined }
  const close = (): Promise<void> => {
    state.closePromise ??= Effect.runPromise(Fiber.interrupt(fiber)).then(() =>
      result.then((exit) => (Exit.isSuccess(exit) ? exit.value.close() : Promise.resolve()))
    )
    return state.closePromise
  }
  return { result, close }
}

const acquiredClients = (acquisition: ClientAcquisition): Promise<Exit.Exit<ClientBundle, HulyClientBundleError>> =>
  acquisition.result.then((exit) =>
    Exit.isSuccess(exit) ? Exit.succeed(exit.value.bundle) : Exit.failCause(exit.cause)
  )

const primedAcquisition = (scoped: ScopedClientBundle): ClientAcquisition => ({
  result: Promise.resolve(Exit.succeed(scoped)),
  close: scoped.close
})

/**
 * Create a memoized client resolver that builds layers on first call and keeps
 * the active scope alive for the process lifetime. Priming transfers ownership
 * of an already acquired scoped bundle to the resolver.
 */
export const createClientResolver = (combinedClientLayer: CombinedClientLayer): ProcessClientResolver => {
  const state: {
    active: ActiveClientAcquisition | undefined
    closePromise: Promise<void> | undefined
    closed: boolean
  } = { active: undefined, closePromise: undefined, closed: false }
  const acquisitions = new Set<ClientAcquisition>()

  const resolve: ClientResolver = () => {
    if (state.closed) return Promise.resolve(Exit.die(new Error("Process-scoped Huly clients are closed")))
    if (state.active === undefined) {
      const acquisition = startClientAcquisition(combinedClientLayer)
      const active = { acquisition, clients: acquiredClients(acquisition) }
      acquisitions.add(acquisition)
      state.active = active
      void acquisition.result.then((exit) => {
        if (Exit.isFailure(exit) && isRecoverableClientUnavailableCause(exit.cause) && state.active === active) {
          state.active = undefined
          acquisitions.delete(acquisition)
        }
      })
    }
    return state.active.clients
  }

  const prime = async (scoped: ScopedClientBundle): Promise<void> => {
    if (state.closed) throw new Error("Cannot prime closed process-scoped Huly clients")
    const previous = state.active?.acquisition
    const acquisition = primedAcquisition(scoped)
    acquisitions.add(acquisition)
    state.active = { acquisition, clients: acquiredClients(acquisition) }
    if (previous !== undefined) {
      acquisitions.delete(previous)
      await previous.close()
    }
  }

  const close = (): Promise<void> => {
    state.closed = true
    if (state.closePromise === undefined) {
      const owned = [...acquisitions]
      acquisitions.clear()
      state.active = undefined
      state.closePromise = Promise.all(owned.map((acquisition) => acquisition.close())).then(() => {})
    }
    return state.closePromise
  }

  return { resolve, prime, close }
}
