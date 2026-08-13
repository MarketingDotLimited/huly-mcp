import { ProtocolError, ProtocolErrorCode } from "@modelcontextprotocol/server"
import type { ListResourcesResult, ReadResourceRequestParams, ReadResourceResult } from "@modelcontextprotocol/server"
import { type Cause, Effect, Exit } from "effect"

import { ConfigValidationError } from "../config/config.js"
import type { ToolWarning } from "../domain/schemas/tool-warnings.js"
import { HulyClient } from "../huly/client.js"
import { Diagnostics, makeDiagnosticsScope } from "../huly/diagnostics.js"
import type { ClientResolver, HulyClientBundleError } from "../runtime/client-resolver.js"
import { classifyCause, findRecoverableCauseFailure } from "../runtime/cause-exit.js"
import { clientResolutionCauseMessage, clientResolutionErrorMessage } from "./error-mapping.js"
import { listResources, readHulyResource } from "./resources.js"
import type { RequestAdmission, RequestLease } from "./request-admission.js"
import { McpErrorCode, SERVER_SHUTTING_DOWN_MESSAGE } from "./tool-responses.js"

interface ResourceReadRequest {
  readonly params: ReadResourceRequestParams
}

interface ResourceHandlerInput {
  readonly resolveClients: ClientResolver
  readonly admission: RequestAdmission
}

const enterOrThrow = (admission: RequestAdmission): RequestLease => {
  const lease = admission.enter()
  if (lease !== null) return lease
  throw new ProtocolError(McpErrorCode.InternalError, SERVER_SHUTTING_DOWN_MESSAGE)
}

const withResourceWarnings = (result: ReadResourceResult, warnings: ReadonlyArray<ToolWarning>): ReadResourceResult =>
  warnings.length === 0 ? result : { ...result, _meta: { ...result._meta, warnings } }

const createResourceClientResolutionError = (uri: string, cause: Cause.Cause<HulyClientBundleError>): ProtocolError =>
  new ProtocolError(
    ProtocolErrorCode.InternalError,
    `${clientResolutionCauseMessage(cause)} Unable to read resource "${uri}".`
  )

const createResourceListClientResolutionError = (cause: Cause.Cause<HulyClientBundleError>): ProtocolError =>
  new ProtocolError(
    ProtocolErrorCode.InternalError,
    `${clientResolutionCauseMessage(cause)} Unable to list Huly resources.`
  )

const createUnknownResourceClientResolutionError = (context: string, error: unknown): ProtocolError =>
  new ProtocolError(ProtocolErrorCode.InternalError, `${clientResolutionErrorMessage(error)} ${context}`)

const isConfigValidationFailure = (cause: Cause.Cause<HulyClientBundleError>): boolean =>
  findRecoverableCauseFailure(
    cause,
    (failure): failure is ConfigValidationError => failure instanceof ConfigValidationError
  ) !== undefined

const throwResourceReadError = (uri: string, cause: Cause.Cause<ProtocolError>): never => {
  const classification = classifyCause(cause)
  if (classification._tag === "Failure" && classification.firstFailure instanceof ProtocolError) {
    throw classification.firstFailure
  }
  throw new ProtocolError(ProtocolErrorCode.InternalError, `Failed to read Huly resource "${uri}"`)
}

const throwResourceListError = (cause: Cause.Cause<ProtocolError>): never => {
  const classification = classifyCause(cause)
  if (classification._tag === "Failure" && classification.firstFailure instanceof ProtocolError) {
    throw classification.firstFailure
  }
  throw new ProtocolError(ProtocolErrorCode.InternalError, "Failed to list Huly resources")
}

const resolveResourceClients = async (
  resolveClients: ClientResolver,
  errorContext: string
): ReturnType<ClientResolver> =>
  resolveClients().catch((error: unknown) => {
    if (error instanceof ConfigValidationError) return Exit.fail(error)
    throw createUnknownResourceClientResolutionError(errorContext, error)
  })

export const createResourceProtocolHandlers = (
  input: ResourceHandlerInput
): {
  readonly listResources: () => Promise<ListResourcesResult>
  readonly readResource: (request: ResourceReadRequest) => Promise<ReadResourceResult>
} => {
  const listResourcesHandler = async (): Promise<ListResourcesResult> => {
    const lease = enterOrThrow(input.admission)
    try {
      const clientExit = await resolveResourceClients(input.resolveClients, "Unable to list Huly resources.")
      if (Exit.isFailure(clientExit)) {
        if (isConfigValidationFailure(clientExit.cause)) return { resources: [] }
        throw createResourceListClientResolutionError(clientExit.cause)
      }
      const clients = clientExit.value

      const resourceList = await Effect.runPromiseExit(
        listResources().pipe(Effect.provideService(HulyClient, clients.hulyClient))
      )
      if (Exit.isSuccess(resourceList)) return resourceList.value
      return throwResourceListError(resourceList.cause)
    } finally {
      lease.release()
    }
  }

  const readResource = async (request: ResourceReadRequest): Promise<ReadResourceResult> => {
    const lease = enterOrThrow(input.admission)
    try {
      const { uri } = request.params
      const clientExit = await resolveResourceClients(input.resolveClients, `Unable to read resource "${uri}".`)
      if (Exit.isFailure(clientExit)) throw createResourceClientResolutionError(uri, clientExit.cause)
      const clients = clientExit.value
      const diagnosticsScope = await Effect.runPromise(makeDiagnosticsScope)
      const resourceRead = await Effect.runPromiseExit(
        readHulyResource(uri).pipe(
          Effect.provideService(HulyClient, clients.hulyClient),
          Effect.provideService(Diagnostics, diagnosticsScope.service)
        )
      )
      const warnings = await Effect.runPromise(diagnosticsScope.drainWarnings)
      if (Exit.isSuccess(resourceRead)) return withResourceWarnings(resourceRead.value, warnings)
      return throwResourceReadError(uri, resourceRead.cause)
    } finally {
      lease.release()
    }
  }

  return { listResources: listResourcesHandler, readResource }
}
