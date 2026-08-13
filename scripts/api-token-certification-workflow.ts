import { Result, Schema } from "effect"

import {
  AttachmentId,
  DocumentId,
  type DocumentIdentifier,
  IssueIdentifier,
  NonEmptyString,
  type ProjectIdentifier,
  TeamspaceId,
  type TeamspaceIdentifier
} from "../src/domain/schemas/shared.js"

const ToolArguments = Schema.Record(Schema.String, Schema.Unknown)

export const CertificationToolNameSchema = Schema.Literals([
  "list_projects",
  "create_issue",
  "update_issue",
  "list_workspaces",
  "add_issue_attachment",
  "download_attachment",
  "list_teamspaces",
  "create_document",
  "edit_document",
  "delete_document",
  "delete_attachment",
  "delete_issue",
  "get_document"
])
export type CertificationToolName = Schema.Schema.Type<typeof CertificationToolNameSchema>

export const CertificationCallSchema = Schema.Struct({
  tool: CertificationToolNameSchema,
  kind: Schema.Literals(["read", "write", "cleanup"]),
  arguments: ToolArguments
})
export type CertificationCall = Schema.Schema.Type<typeof CertificationCallSchema>

const CertificationSuccessSchema = Schema.TaggedStruct("Success", { value: Schema.Unknown })
const CertificationFailureSchema = Schema.TaggedStruct("Failure", { message: Schema.String })
const CertificationUncertainSchema = Schema.TaggedStruct("Uncertain", { message: Schema.String })
export const CertificationCallResultSchema = Schema.Union([
  CertificationSuccessSchema,
  CertificationFailureSchema,
  CertificationUncertainSchema
])
export type CertificationCallResult = Schema.Schema.Type<typeof CertificationCallResultSchema>

export const CertificationSurfaceSchema = Schema.Literals([
  "core-rest",
  "account",
  "storage-file",
  "collaborator-markup"
])
export type CertificationSurface = Schema.Schema.Type<typeof CertificationSurfaceSchema>

export const ActiveSurfaceStatusSchema = Schema.Literals(["passed", "failed", "uncertain", "skipped"])
export type ActiveSurfaceStatus = Schema.Schema.Type<typeof ActiveSurfaceStatusSchema>
const ActiveSurfaceFields = { status: ActiveSurfaceStatusSchema, detail: Schema.String }
const ActiveCertificationSurfacesSchema = Schema.Tuple([
  Schema.Struct({ surface: Schema.Literal("core-rest"), ...ActiveSurfaceFields }),
  Schema.Struct({ surface: Schema.Literal("account"), ...ActiveSurfaceFields }),
  Schema.Struct({ surface: Schema.Literal("storage-file"), ...ActiveSurfaceFields }),
  Schema.Struct({ surface: Schema.Literal("collaborator-markup"), ...ActiveSurfaceFields })
])

const RevokedSurfaceStatusSchema = Schema.Literals(["call-succeeded", "call-failed", "uncertain"])
const RevokedSurfaceFields = { status: RevokedSurfaceStatusSchema, detail: Schema.String }
const RevokedCertificationSurfacesSchema = Schema.Tuple([
  Schema.Struct({ surface: Schema.Literal("core-rest"), ...RevokedSurfaceFields }),
  Schema.Struct({ surface: Schema.Literal("account"), ...RevokedSurfaceFields }),
  Schema.Struct({ surface: Schema.Literal("storage-file"), ...RevokedSurfaceFields }),
  Schema.Struct({ surface: Schema.Literal("collaborator-markup"), ...RevokedSurfaceFields })
])
const ResourceNotCreatedSchema = Schema.TaggedStruct("NotCreated", {})
const ResourceWriteUncertainSchema = Schema.TaggedStruct("WriteUncertain", {})
const ResourceConfirmedSchema = Schema.TaggedStruct("Confirmed", {
  cleanup: Schema.Literals(["cleaned", "failed", "uncertain"])
})
export const CertificationResourceCleanupSchema = Schema.Union([
  ResourceNotCreatedSchema,
  ResourceWriteUncertainSchema,
  ResourceConfirmedSchema
])
export type CertificationResourceCleanup = Schema.Schema.Type<typeof CertificationResourceCleanupSchema>
type ResourceConfirmed = Schema.Schema.Type<typeof ResourceConfirmedSchema>
export const CertificationCleanupSchema = Schema.Union([
  Schema.Struct({
    issue: ResourceWriteUncertainSchema,
    attachment: ResourceNotCreatedSchema,
    document: ResourceNotCreatedSchema
  }),
  Schema.Struct({
    issue: ResourceNotCreatedSchema,
    attachment: ResourceNotCreatedSchema,
    document: CertificationResourceCleanupSchema
  }),
  Schema.Struct({
    issue: ResourceConfirmedSchema,
    attachment: CertificationResourceCleanupSchema,
    document: CertificationResourceCleanupSchema
  })
])
export type CertificationCleanup = Schema.Schema.Type<typeof CertificationCleanupSchema>

const ActiveCertificationReportFields = {
  phase: Schema.Literal("active"),
  surfaces: ActiveCertificationSurfacesSchema,
  cleanup: CertificationCleanupSchema
}
export const ActiveStdioCertificationReportSchema = Schema.Struct({
  ...ActiveCertificationReportFields,
  transport: Schema.Literal("stdio")
})
export const ActiveHttpCertificationReportSchema = Schema.Struct({
  ...ActiveCertificationReportFields,
  transport: Schema.Literal("http")
})
export const ActiveCertificationReportSchema = Schema.Struct({
  ...ActiveCertificationReportFields,
  transport: Schema.Literals(["stdio", "http"])
})
export type ActiveCertificationReport = Schema.Schema.Type<typeof ActiveCertificationReportSchema>

const RevokedCertificationReportFields = {
  phase: Schema.Literal("revoked"),
  surfaces: RevokedCertificationSurfacesSchema
}
export const RevokedStdioCertificationReportSchema = Schema.Struct({
  ...RevokedCertificationReportFields,
  transport: Schema.Literal("stdio")
})
export const RevokedHttpCertificationReportSchema = Schema.Struct({
  ...RevokedCertificationReportFields,
  transport: Schema.Literal("http")
})
export const RevokedCertificationReportSchema = Schema.Struct({
  ...RevokedCertificationReportFields,
  transport: Schema.Literals(["stdio", "http"])
})
export type RevokedCertificationReport = Schema.Schema.Type<typeof RevokedCertificationReportSchema>

export const CertificationReportSchema = Schema.Union([
  ActiveCertificationReportSchema,
  RevokedCertificationReportSchema
])
export type CertificationReport = Schema.Schema.Type<typeof CertificationReportSchema>

export interface CertificationPort {
  readonly call: (request: CertificationCall) => Promise<CertificationCallResult>
}

interface ActiveCertificationOptions {
  readonly project: ProjectIdentifier
  readonly runId: CertificationRunId
  readonly transport: "stdio" | "http"
}

interface RevokedCertificationOptions {
  readonly attachmentId: AttachmentId
  readonly document: DocumentIdentifier
  readonly teamspace: TeamspaceIdentifier
  readonly transport: "stdio" | "http"
}

export const CertificationRunId = NonEmptyString.pipe(Schema.brand("CertificationRunId"))
export type CertificationRunId = Schema.Schema.Type<typeof CertificationRunId>

const IssueCreated = Schema.Struct({ identifier: IssueIdentifier })
const AttachmentCreated = Schema.Struct({ attachmentId: AttachmentId })
const DocumentCreated = Schema.Struct({ id: DocumentId })
const TeamspacesListed = Schema.Struct({
  teamspaces: Schema.Array(Schema.Struct({ id: TeamspaceId, name: NonEmptyString }))
})

const call = (
  port: CertificationPort,
  tool: CertificationToolName,
  kind: CertificationCall["kind"],
  args: Readonly<Record<string, unknown>> = {}
): Promise<CertificationCallResult> => port.call(CertificationCallSchema.make({ tool, kind, arguments: args }))

const detail = (result: CertificationCallResult): string =>
  result._tag === "Success" ? "All representative operations passed." : result.message

const activeStatus = (result: CertificationCallResult): "passed" | "failed" | "uncertain" =>
  result._tag === "Success" ? "passed" : result._tag === "Uncertain" ? "uncertain" : "failed"

const decodeSuccess = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  result: Schema.Schema.Type<typeof CertificationSuccessSchema>
): S["Type"] | undefined => {
  const decoded = Schema.decodeUnknownResult(schema)(result.value)
  return Result.isSuccess(decoded) ? decoded.success : undefined
}

const surfaceResult = <S extends CertificationSurface>(
  surface: S,
  result: CertificationCallResult
): { readonly detail: string; readonly status: ActiveSurfaceStatus; readonly surface: S } => ({
  surface,
  status: activeStatus(result),
  detail: detail(result)
})

const skippedSurface = <S extends CertificationSurface>(
  surface: S,
  reason: string
): { readonly detail: string; readonly status: ActiveSurfaceStatus; readonly surface: S } => ({
  surface,
  status: "skipped",
  detail: reason
})

const uncertainActiveReport = (transport: "stdio" | "http", message: string): ActiveCertificationReport => ({
  phase: "active",
  transport,
  surfaces: [
    { surface: "core-rest", status: "uncertain", detail: message },
    skippedSurface("account", "Stopped after an uncertain write outcome."),
    skippedSurface("storage-file", "Stopped after an uncertain write outcome."),
    skippedSurface("collaborator-markup", "Stopped after an uncertain write outcome.")
  ],
  cleanup: { issue: { _tag: "WriteUncertain" }, attachment: { _tag: "NotCreated" }, document: { _tag: "NotCreated" } }
})

interface ConfirmedDocument {
  readonly documentId: DocumentId
  readonly teamspace: TeamspaceId
}

interface ConfirmedResources {
  attachmentId?: AttachmentId
  document?: ConfirmedDocument
  issueIdentifier?: IssueIdentifier
  readonly uncertainWrites: Set<"attachment" | "document">
}

const cleanupAttempt = async (port: CertificationPort, request: CertificationCall): Promise<ResourceConfirmed> => {
  const result = await port.call(request)
  if (result._tag === "Success") return { _tag: "Confirmed", cleanup: "cleaned" }
  return { _tag: "Confirmed", cleanup: result._tag === "Uncertain" ? "uncertain" : "failed" }
}

const cleanupResource = (
  port: CertificationPort,
  request: CertificationCall | undefined,
  writeUncertain: boolean
): Promise<CertificationResourceCleanup> =>
  request === undefined
    ? Promise.resolve(writeUncertain ? { _tag: "WriteUncertain" } : { _tag: "NotCreated" })
    : cleanupAttempt(port, request)

const cleanupConfirmed = async (
  port: CertificationPort,
  project: ProjectIdentifier,
  resources: ConfirmedResources
): Promise<CertificationCleanup> => {
  const documentRequest =
    resources.document === undefined
      ? undefined
      : CertificationCallSchema.make({
          tool: "delete_document",
          kind: "cleanup",
          arguments: { teamspace: resources.document.teamspace, document: resources.document.documentId }
        })
  const attachmentRequest =
    resources.attachmentId === undefined
      ? undefined
      : CertificationCallSchema.make({
          tool: "delete_attachment",
          kind: "cleanup",
          arguments: { attachmentId: resources.attachmentId }
        })
  const document = await cleanupResource(port, documentRequest, resources.uncertainWrites.has("document"))
  if (resources.issueIdentifier === undefined) {
    return { issue: { _tag: "NotCreated" }, attachment: { _tag: "NotCreated" }, document }
  }
  const attachment = await cleanupResource(port, attachmentRequest, resources.uncertainWrites.has("attachment"))
  const issue = await cleanupAttempt(
    port,
    CertificationCallSchema.make({
      tool: "delete_issue",
      kind: "cleanup",
      arguments: { project, identifier: resources.issueIdentifier }
    })
  )
  return { issue, attachment, document }
}

const runCore = async (
  port: CertificationPort,
  options: ActiveCertificationOptions,
  resources: ConfirmedResources
): Promise<CertificationCallResult> => {
  const listed = await call(port, "list_projects", "read")
  if (listed._tag !== "Success") return listed
  const created = await call(port, "create_issue", "write", {
    project: options.project,
    title: `API token certification ${options.runId}`
  })
  if (created._tag !== "Success") return created
  const issue = decodeSuccess(IssueCreated, created)
  if (issue === undefined)
    return { _tag: "Uncertain", message: "Issue creation succeeded without a usable identifier." }
  resources.issueIdentifier = issue.identifier
  return call(port, "update_issue", "write", {
    project: options.project,
    identifier: issue.identifier,
    title: `API token certification ${options.runId} updated`
  })
}

const runStorage = async (
  port: CertificationPort,
  project: ProjectIdentifier,
  resources: ConfirmedResources
): Promise<CertificationCallResult> => {
  if (resources.issueIdentifier === undefined) {
    return { _tag: "Failure", message: "Storage probe requires the confirmed core issue." }
  }
  const created = await call(port, "add_issue_attachment", "write", {
    project,
    identifier: resources.issueIdentifier,
    filename: "api-token-certification.txt",
    contentType: "text/plain",
    data: "YXBpLXRva2VuLWNlcnRpZmljYXRpb24="
  })
  if (created._tag !== "Success") {
    if (created._tag === "Uncertain") resources.uncertainWrites.add("attachment")
    return created
  }
  const attachment = decodeSuccess(AttachmentCreated, created)
  if (attachment === undefined) {
    resources.uncertainWrites.add("attachment")
    return { _tag: "Uncertain", message: "Attachment creation succeeded without a usable identifier." }
  }
  resources.attachmentId = attachment.attachmentId
  return call(port, "download_attachment", "read", { attachmentId: attachment.attachmentId })
}

const runCollaborator = async (
  port: CertificationPort,
  runId: CertificationRunId,
  resources: ConfirmedResources
): Promise<CertificationCallResult> => {
  const listed = await call(port, "list_teamspaces", "read", { limit: 20 })
  if (listed._tag !== "Success") return listed
  const teamspaces = decodeSuccess(TeamspacesListed, listed)
  const teamspace = teamspaces?.teamspaces[0]
  if (teamspace === undefined) return { _tag: "Failure", message: "No active teamspace is available." }
  const created = await call(port, "create_document", "write", {
    teamspace: teamspace.id,
    title: `API token certification ${runId}`,
    content: "# API token certification\n\nactive"
  })
  if (created._tag !== "Success") {
    if (created._tag === "Uncertain") resources.uncertainWrites.add("document")
    return created
  }
  const document = decodeSuccess(DocumentCreated, created)
  if (document === undefined) {
    resources.uncertainWrites.add("document")
    return { _tag: "Uncertain", message: "Document creation succeeded without a usable identifier." }
  }
  resources.document = { documentId: document.id, teamspace: teamspace.id }
  const edited = await call(port, "edit_document", "write", {
    teamspace: teamspace.id,
    document: document.id,
    content: "# API token certification\n\ncertification updated"
  })
  return edited
}

export const runActiveCertification = async (
  port: CertificationPort,
  options: ActiveCertificationOptions
): Promise<ActiveCertificationReport> => {
  const resources: ConfirmedResources = { uncertainWrites: new Set() }
  const core = await runCore(port, options, resources)
  if (core._tag === "Uncertain" && resources.issueIdentifier === undefined) {
    return uncertainActiveReport(options.transport, core.message)
  }

  const account = await call(port, "list_workspaces", "read", { limit: 20 })
  const storage = await runStorage(port, options.project, resources)
  const collaborator = await runCollaborator(port, options.runId, resources)
  const cleanup = await cleanupConfirmed(port, options.project, resources)

  return {
    phase: "active",
    transport: options.transport,
    surfaces: [
      surfaceResult("core-rest", core),
      surfaceResult("account", account),
      surfaceResult("storage-file", storage),
      surfaceResult("collaborator-markup", collaborator)
    ],
    cleanup
  }
}

const revokedProbe = async <S extends CertificationSurface>(
  port: CertificationPort,
  surface: S,
  tool: CertificationToolName,
  arguments_: Readonly<Record<string, unknown>> = {}
): Promise<{
  readonly detail: string
  readonly status: "call-succeeded" | "call-failed" | "uncertain"
  readonly surface: S
}> => {
  const result = await call(port, tool, "read", arguments_)
  if (result._tag === "Failure") return { surface, status: "call-failed", detail: result.message }
  if (result._tag === "Uncertain") return { surface, status: "uncertain", detail: result.message }
  return { surface, status: "call-succeeded", detail: "The service call succeeded." }
}

export const runRevokedCertification = async (
  port: CertificationPort,
  options: RevokedCertificationOptions
): Promise<RevokedCertificationReport> => ({
  phase: "revoked",
  transport: options.transport,
  surfaces: await Promise.all([
    revokedProbe(port, "core-rest", "list_projects"),
    revokedProbe(port, "account", "list_workspaces"),
    revokedProbe(port, "storage-file", "download_attachment", { attachmentId: options.attachmentId }),
    revokedProbe(port, "collaborator-markup", "get_document", {
      teamspace: options.teamspace,
      document: options.document
    })
  ])
})
