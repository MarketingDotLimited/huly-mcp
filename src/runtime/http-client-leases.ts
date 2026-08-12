import { ConfigProvider, Effect, Exit } from "effect"

import { hulyConfigProviderFromHeaders } from "../config/config.js"
import type { RequestClientLease } from "../mcp/request-client-lifecycle.js"
import { buildScopedClientBundle, type CombinedClientLayer } from "./huly-clients.js"
import type { ClientBundle, ClientResolver, HulyClientBundleError } from "./client-resolver.js"

const webHeadersRecord = (headers: Headers): Record<string, string> => Object.fromEntries(headers.entries())

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
