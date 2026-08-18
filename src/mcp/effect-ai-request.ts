import { Context, Effect, Option } from "effect"

import type { SanitizedHulyRuntimeConfigContext } from "../config/config.js"
import type { ClientResolver } from "../runtime/client-resolver.js"
import { McpRequestContextService } from "./request-context.js"

/**
 * Select the resolver attached to the current request fiber when a transport
 * supplied one; stdio and direct tests use the registry fallback.
 */
export const requestScopedResolver = (fallback: ClientResolver): Effect.Effect<ClientResolver> =>
  Effect.contextWith((services: Context.Context<never>) => {
    const requestContext = Context.getOption(services, McpRequestContextService)
    return Effect.succeed(Option.isSome(requestContext) ? requestContext.value.resolveClients : fallback)
  })

export const requestScopedRuntimeConfig = (
  fallback: SanitizedHulyRuntimeConfigContext
): Effect.Effect<SanitizedHulyRuntimeConfigContext> =>
  Effect.contextWith((services: Context.Context<never>) => {
    const requestContext = Context.getOption(services, McpRequestContextService)
    return Effect.succeed(Option.isSome(requestContext) ? requestContext.value.runtimeConfig : fallback)
  })
