import { Schema } from "effect"

import {
  AttachmentId,
  DocumentIdentifier,
  ProjectIdentifier,
  TeamspaceIdentifier
} from "../src/domain/schemas/shared.js"
import type { CertificationSecretSafety } from "./api-token-certification-security.js"
import {
  ActiveHttpCertificationReportSchema,
  ActiveStdioCertificationReportSchema,
  type CertificationPort,
  type CertificationReport,
  CertificationRunId,
  RevokedHttpCertificationReportSchema,
  RevokedStdioCertificationReportSchema,
  runActiveCertification,
  runRevokedCertification
} from "./api-token-certification-workflow.js"

export const CertificationTransport = Schema.Literals(["stdio", "http"])
export type CertificationTransport = Schema.Schema.Type<typeof CertificationTransport>

export const ActiveOrchestrationInputSchema = Schema.Struct({
  phase: Schema.Literal("active"),
  project: ProjectIdentifier,
  runId: CertificationRunId
})

export const RevokedOrchestrationInputSchema = Schema.Struct({
  phase: Schema.Literal("revoked"),
  attachmentId: AttachmentId,
  document: DocumentIdentifier,
  teamspace: TeamspaceIdentifier
})

export const CertificationOrchestrationInputSchema = Schema.Union([
  ActiveOrchestrationInputSchema,
  RevokedOrchestrationInputSchema
])
export type CertificationOrchestrationInput = Schema.Schema.Type<typeof CertificationOrchestrationInputSchema>

export interface ManagedCertificationPort {
  readonly close: () => Promise<void>
  readonly port: CertificationPort
}

export interface CertificationOrchestrationDependencies {
  readonly connect: (transport: CertificationTransport) => Promise<ManagedCertificationPort>
}

type ActiveCertificationReports = readonly [
  Schema.Schema.Type<typeof ActiveStdioCertificationReportSchema>,
  Schema.Schema.Type<typeof ActiveHttpCertificationReportSchema>
]
type RevokedCertificationReports = readonly [
  Schema.Schema.Type<typeof RevokedStdioCertificationReportSchema>,
  Schema.Schema.Type<typeof RevokedHttpCertificationReportSchema>
]
export type CertificationReports = ActiveCertificationReports | RevokedCertificationReports

const withManagedPort = async <A>(
  dependencies: CertificationOrchestrationDependencies,
  transport: CertificationTransport,
  operation: (port: CertificationPort) => Promise<A>
): Promise<A> => {
  const managed = await dependencies.connect(transport)
  try {
    return await operation(managed.port)
  } finally {
    await managed.close()
  }
}

export const runCertificationTransports = async (
  dependencies: CertificationOrchestrationDependencies,
  input: CertificationOrchestrationInput
): Promise<CertificationReports> => {
  if (input.phase === "active") {
    const stdio = await withManagedPort(dependencies, "stdio", async (port) =>
      ActiveStdioCertificationReportSchema.make({
        ...(await runActiveCertification(port, { project: input.project, runId: input.runId, transport: "stdio" })),
        transport: "stdio"
      })
    )
    const http = await withManagedPort(dependencies, "http", async (port) =>
      ActiveHttpCertificationReportSchema.make({
        ...(await runActiveCertification(port, { project: input.project, runId: input.runId, transport: "http" })),
        transport: "http"
      })
    )
    return [stdio, http]
  }
  const revokedOptions = { attachmentId: input.attachmentId, document: input.document, teamspace: input.teamspace }
  const stdio = await withManagedPort(dependencies, "stdio", async (port) =>
    RevokedStdioCertificationReportSchema.make({
      ...(await runRevokedCertification(port, { ...revokedOptions, transport: "stdio" })),
      transport: "stdio"
    })
  )
  const http = await withManagedPort(dependencies, "http", async (port) =>
    RevokedHttpCertificationReportSchema.make({
      ...(await runRevokedCertification(port, { ...revokedOptions, transport: "http" })),
      transport: "http"
    })
  )
  return [stdio, http]
}

const cleanupSucceeded = (report: CertificationReport): boolean =>
  report.phase === "revoked" ||
  [report.cleanup.issue, report.cleanup.attachment, report.cleanup.document].every(
    (resource) => resource._tag === "NotCreated" || (resource._tag === "Confirmed" && resource.cleanup === "cleaned")
  )

const reportSucceeded = (report: CertificationReport): boolean =>
  report.phase === "active"
    ? cleanupSucceeded(report) && report.surfaces.every(({ status }) => status === "passed")
    : report.surfaces.every(({ status }) => status === "call-failed")

export const isCertificationSuccessful = (
  reports: CertificationReports,
  secretSafety: CertificationSecretSafety
): boolean => !secretSafety.secretDetected && reportSucceeded(reports[0]) && reportSucceeded(reports[1])
