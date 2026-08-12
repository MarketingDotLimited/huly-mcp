import { Effect, type Scope } from "effect"

export interface ClosableClient {
  readonly close: () => Promise<void>
}

export const acquireClosableClient = <A extends { readonly client: ClosableClient }, E, R>(
  acquire: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R | Scope.Scope> =>
  Effect.acquireRelease(acquire, ({ client }) => Effect.promise(() => client.close()))
