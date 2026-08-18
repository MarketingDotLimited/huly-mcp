/** Effect AI resource-template registration for Huly project and issue URIs. */
import { Effect, Exit, Schema } from "effect"
import { registerResource, type McpServer } from "effect/unstable/ai/McpServer"
import * as McpSchema from "effect/unstable/ai/McpSchema"

import { IssueIdentifier, ProjectIdentifier } from "../domain/schemas/shared.js"
import type { ToolWarning } from "../domain/schemas/tool-warnings.js"
import { HulyClient } from "../huly/client.js"
import { Diagnostics, makeDiagnosticsScope } from "../huly/diagnostics.js"
import {
  type ClientBundle,
  type ClientResolver,
  type HulyClientBundleError,
  resolveClientBundleAbortably
} from "../runtime/client-resolver.js"
import { EffectMcpBoundaryError } from "./effect-ai-boundary-error.js"
import { mapClientResolutionCauseToMcp } from "./error-mapping.js"
import { requestScopedResolver } from "./effect-ai-request.js"
import { listResources, readHulyResource } from "./resources.js"
import type { RequestAdmission } from "./request-admission.js"
import type { RequestClientLease } from "./request-client-lifecycle.js"

type EffectReadResourceResult = typeof McpSchema.ReadResourceResult.Type
type EffectListResourcesResult = typeof McpSchema.ListResourcesResult.Type
type ResourceReader = (uri: string) => Effect.Effect<unknown, unknown, HulyClient | Diagnostics>
type ResourceClientLeaseResolver = (
  signal: AbortSignal
) => Promise<RequestClientLease<Exit.Exit<ClientBundle, HulyClientBundleError>>>

const CONCRETE_RESOURCE_READINESS_TIMEOUT = "3 seconds"

export interface EffectMcpResourceOptions {
  readonly concreteResources?: Effect.Effect<EffectListResourcesResult>
  readonly readResource?: ResourceReader
  readonly leaseResolver?: ResourceClientLeaseResolver
  readonly discoverConcreteResources?: boolean
}

const provideResourceResult = (
  result: unknown,
  uri: string,
  warnings: ReadonlyArray<ToolWarning>
): Effect.Effect<EffectReadResourceResult, McpSchema.InternalError> =>
  Schema.decodeUnknownEffect(McpSchema.ReadResourceResult)({
    ...(typeof result === "object" && result !== null ? result : { contents: [] }),
    ...(warnings.length === 0 ? {} : { _meta: { warnings } })
  }).pipe(
    Effect.mapError(
      () => new McpSchema.InternalError({ message: `Failed to build Huly resource response for "${uri}".` })
    )
  )

const resourceFailure = (error: unknown, uri: string): McpSchema.InternalError =>
  new McpSchema.InternalError({
    message: error instanceof Error ? error.message : `Failed to read Huly resource "${uri}".`
  })

const resolveClients = (resolver: ClientResolver): Effect.Effect<Exit.Exit<ClientBundle, unknown>, never> =>
  Effect.tryPromise({
    try: (signal) => resolveClientBundleAbortably(resolver, signal),
    catch: (cause) => new EffectMcpBoundaryError({ cause })
  }).pipe(Effect.match({ onFailure: (error) => Exit.fail(error.cause), onSuccess: (result) => result }))

const makeResourceContent = (
  resolver: ClientResolver,
  uri: string,
  admission: RequestAdmission,
  readResource: ResourceReader
): Effect.Effect<EffectReadResourceResult, McpSchema.InternalError> =>
  Effect.acquireUseRelease(
    Effect.sync(() => admission.enter()),
    (lease) =>
      lease === null
        ? Effect.fail(
            new McpSchema.InternalError({
              message: "Huly MCP is shutting down; start a new connection before retrying"
            })
          )
        : Effect.gen(function* () {
            const requestResolver = yield* requestScopedResolver(resolver)
            const clients = yield* resolveClients(requestResolver)
            if (Exit.isFailure(clients)) {
              return yield* new McpSchema.InternalError({
                message: mapClientResolutionCauseToMcp(clients.cause).content[0].text
              })
            }
            const diagnosticsScope = yield* makeDiagnosticsScope
            const result = yield* readResource(uri).pipe(
              Effect.provideService(HulyClient, clients.value.hulyClient),
              Effect.provideService(Diagnostics, diagnosticsScope.service),
              Effect.mapError((error) => resourceFailure(error, uri))
            )
            const warnings = yield* diagnosticsScope.drainWarnings
            return yield* provideResourceResult(result, uri, warnings)
          }),
    (lease) => Effect.sync(() => lease?.release())
  )

const loadConcreteResources = (
  resolver: ClientResolver,
  leaseResolver?: ResourceClientLeaseResolver
): Effect.Effect<EffectListResourcesResult> => {
  const acquire =
    leaseResolver === undefined
      ? resolveClients(resolver).pipe(Effect.map((bundle) => ({ bundle, close: () => {} })))
      : Effect.tryPromise({ try: leaseResolver, catch: (cause) => new EffectMcpBoundaryError({ cause }) })
  return Effect.gen(function* () {
    const lease = yield* acquire
    const listed = Exit.isFailure(lease.bundle)
      ? Effect.succeed({ resources: [] })
      : listResources().pipe(
          Effect.provideService(HulyClient, lease.bundle.value.hulyClient),
          Effect.catch(() => Effect.succeed({ resources: [] }))
        )
    return yield* listed.pipe(Effect.ensuring(Effect.promise(async () => lease.close()).pipe(Effect.ignore)))
  }).pipe(Effect.catch(() => Effect.succeed({ resources: [] })))
}

const registerConcreteResources = (
  resolver: ClientResolver,
  admission: RequestAdmission,
  readResource: ResourceReader,
  concreteResources: Effect.Effect<EffectListResourcesResult>
): Effect.Effect<void, never, McpServer> =>
  Effect.gen(function* () {
    const listed = yield* concreteResources
    for (const resource of listed.resources) {
      yield* registerResource({
        uri: resource.uri,
        name: resource.name,
        ...(resource.description === undefined ? {} : { description: resource.description }),
        ...(resource.mimeType === undefined ? {} : { mimeType: resource.mimeType }),
        content: makeResourceContent(resolver, resource.uri, admission, readResource)
      })
    }
  })

/** Register concrete Huly projects and all Huly resource templates into an Effect AI server. */
export const registerEffectMcpResources = (
  resolver: ClientResolver,
  admission: RequestAdmission,
  options: EffectMcpResourceOptions = {}
): Effect.Effect<void, never, McpServer> =>
  Effect.gen(function* () {
    const readResource = options.readResource ?? readHulyResource
    const projectTemplate = registerResource`huly://projects/${McpSchema.param("project", ProjectIdentifier)}`
    yield* projectTemplate({
      name: "huly-project",
      description:
        "Read full details for a Huly tracker project by project identifier, for example huly://projects/HULY.",
      mimeType: "application/json",
      content: (uri) => makeResourceContent(resolver, uri, admission, readResource)
    })

    const issueTemplate = registerResource`huly://issues/${McpSchema.param("issue", IssueIdentifier)}`
    yield* issueTemplate({
      name: "huly-issue",
      description: "Read full details for a Huly issue by full issue identifier, for example huly://issues/HULY-123.",
      mimeType: "application/json",
      content: (uri) => makeResourceContent(resolver, uri, admission, readResource)
    })

    const projectIssueTemplate = registerResource`huly://projects/${McpSchema.param(
      "project",
      ProjectIdentifier
    )}/issues/${McpSchema.param("issue", IssueIdentifier)}`
    yield* projectIssueTemplate({
      name: "huly-project-issue",
      description:
        "Read full details for a Huly issue by project identifier and issue number, for example huly://projects/HULY/issues/123.",
      mimeType: "application/json",
      content: (uri) => makeResourceContent(resolver, uri, admission, readResource)
    })

    if (options.discoverConcreteResources === false) return
    const discoveryEffect = options.concreteResources ?? loadConcreteResources(resolver, options.leaseResolver)
    yield* registerConcreteResources(resolver, admission, readResource, discoveryEffect).pipe(
      Effect.timeoutOption(CONCRETE_RESOURCE_READINESS_TIMEOUT),
      Effect.ignore
    )
  })
