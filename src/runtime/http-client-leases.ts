import { ConfigProvider, Effect, Exit } from "effect"

import { hulyConfigProviderFromHeaders } from "../config/config.js"
import type { RequestClientLease } from "../mcp/request-client-lifecycle.js"
import { awaitAbortably } from "../utils/abortable-promise.js"
import type { ClientBundle, ClientResolver, HulyClientBundleError } from "./client-resolver.js"
import { buildScopedClientBundle, type CombinedClientLayer, type ScopedClientBundle } from "./huly-clients.js"

const webHeadersRecord = (headers: Headers): Record<string, string> => Object.fromEntries(headers.entries())

export const createClientLeaseResolver =
  (
    combinedClientLayer: CombinedClientLayer
  ): ((signal: AbortSignal) => Promise<RequestClientLease<Exit.Exit<ClientBundle, HulyClientBundleError>>>) =>
  async (signal) => {
    const clientExit = await awaitAbortably(
      Effect.runPromiseExit(buildScopedClientBundle(combinedClientLayer), { signal }),
      signal,
      "Huly resource discovery client acquisition was interrupted"
    )
    return Exit.isSuccess(clientExit)
      ? { bundle: Exit.succeed(clientExit.value.bundle), close: clientExit.value.close }
      : { bundle: Exit.failCause(clientExit.cause), close: () => {} }
  }

export const createPrimingClientLeaseResolver = (
  combinedClientLayer: CombinedClientLayer,
  prime: (scoped: ScopedClientBundle) => Promise<void>
): ((signal: AbortSignal) => Promise<RequestClientLease<Exit.Exit<ClientBundle, HulyClientBundleError>>>) => {
  const acquire = createClientLeaseResolver(combinedClientLayer)
  return async (signal) => {
    const lease = await acquire(signal)
    if (Exit.isFailure(lease.bundle)) return lease
    try {
      await prime({ bundle: lease.bundle.value, close: async () => lease.close() })
      return { bundle: lease.bundle, close: () => {} }
    } catch (cause) {
      await lease.close()
      throw cause
    }
  }
}

export const createHttpClientLeaseResolver =
  (
    combinedClientLayer: CombinedClientLayer,
    resolveEnvClients: ClientResolver
  ): ((request: Request) => Promise<RequestClientLease<Exit.Exit<ClientBundle, HulyClientBundleError>>>) =>
  async (request) => {
    const providerExit = await Effect.runPromiseExit(hulyConfigProviderFromHeaders(webHeadersRecord(request.headers)))
    if (Exit.isFailure(providerExit)) {
      return { bundle: Exit.failCause(providerExit.cause), close: () => {} }
    }

    const configProvider = providerExit.value
    if (configProvider === undefined) {
      return resolveEnvClients().then((bundle) => ({ bundle, close: () => {} }))
    }

    const clientExit = await Effect.runPromiseExit(
      buildScopedClientBundle(combinedClientLayer).pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, configProvider),
        Effect.map(({ bundle, close }) => ({ bundle: Exit.succeed(bundle), close }))
      )
    )
    return Exit.isSuccess(clientExit) ? clientExit.value : { bundle: Exit.failCause(clientExit.cause), close: () => {} }
  }
