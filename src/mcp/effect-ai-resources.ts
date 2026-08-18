/** Effect AI resource-template registration for Huly project and issue URIs. */
import { Effect, Exit, Schema } from "effect"
import { registerResource, type McpServer } from "effect/unstable/ai/McpServer"
import * as McpSchema from "effect/unstable/ai/McpSchema"

import { IssueIdentifier, ProjectIdentifier } from "../domain/schemas/shared.js"
import type { ToolWarning } from "../domain/schemas/tool-warnings.js"
import { HulyClient } from "../huly/client.js"
import { Diagnostics, makeDiagnosticsScope } from "../huly/diagnostics.js"
import type { ClientBundle, ClientResolver } from "../runtime/client-resolver.js"
import { mapClientResolutionCauseToMcp } from "./error-mapping.js"
import { requestScopedResolver } from "./effect-ai-request.js"
import { readHulyResource } from "./resources.js"
import type { RequestAdmission } from "./request-admission.js"

type EffectReadResourceResult = typeof McpSchema.ReadResourceResult.Type

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

const resolveClients = (
  resolver: ClientResolver
): Effect.Effect<Exit.Exit<ClientBundle, unknown>, never> =>
  Effect.tryPromise({ try: resolver, catch: (cause) => cause }).pipe(
    Effect.match({ onFailure: (cause) => Exit.fail(cause), onSuccess: (result) => result })
  )

const makeResourceContent = (
  resolver: ClientResolver,
  uri: string,
  admission: RequestAdmission
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
            const result = yield* readHulyResource(uri).pipe(
              Effect.provideService(HulyClient, clients.value.hulyClient),
              Effect.provideService(Diagnostics, diagnosticsScope.service),
              Effect.mapError((error) => resourceFailure(error, uri))
            )
            const warnings = yield* diagnosticsScope.drainWarnings
            return yield* provideResourceResult(result, uri, warnings)
          }),
    (lease) => Effect.sync(() => lease?.release())
  )

/** Register all Huly resource templates into an already-provided McpServer. */
export const registerEffectMcpResourceTemplates = (
  resolver: ClientResolver,
  admission: RequestAdmission
): Effect.Effect<void, never, McpServer> =>
  Effect.gen(function* () {
    const projectTemplate = registerResource`huly://projects/${McpSchema.param("project", ProjectIdentifier)}`
    yield* projectTemplate({
      name: "huly-project",
      description:
        "Read full details for a Huly tracker project by project identifier, for example huly://projects/HULY.",
      mimeType: "application/json",
      content: (uri) => makeResourceContent(resolver, uri, admission)
    })

    const issueTemplate = registerResource`huly://issues/${McpSchema.param("issue", IssueIdentifier)}`
    yield* issueTemplate({
      name: "huly-issue",
      description:
        "Read full details for a Huly issue by full issue identifier, for example huly://issues/HULY-123.",
      mimeType: "application/json",
      content: (uri) => makeResourceContent(resolver, uri, admission)
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
      content: (uri) => makeResourceContent(resolver, uri, admission)
    })
  })
