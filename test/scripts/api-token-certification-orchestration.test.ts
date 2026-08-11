import { expect, test } from "vitest"

import {
  AttachmentId,
  DocumentIdentifier,
  ProjectIdentifier,
  TeamspaceIdentifier
} from "../../src/domain/schemas/shared.js"
import {
  isCertificationSuccessful,
  RevokedOrchestrationInputSchema,
  runCertificationTransports,
  type CertificationTransport,
  type ManagedCertificationPort
} from "../../scripts/api-token-certification-orchestration.js"
import {
  type CertificationCall,
  type CertificationCallResult,
  type CertificationToolName,
  CertificationRunId
} from "../../scripts/api-token-certification-workflow.js"

const successfulValue = (tool: CertificationToolName): unknown => {
  if (tool === "create_issue") return { identifier: "HULY-42" }
  if (tool === "add_issue_attachment") return { attachmentId: "attachment-1" }
  if (tool === "list_teamspaces") return { teamspaces: [{ id: "teamspace-1", name: "Documents" }] }
  if (tool === "create_document") return { id: "document-1" }
  return {}
}

const passingManagedPort = (closed: Array<CertificationTransport>, transport: CertificationTransport) =>
  ({
    port: {
      call: (request: CertificationCall): Promise<CertificationCallResult> =>
        Promise.resolve({ _tag: "Success", value: successfulValue(request.tool) })
    },
    close: () => {
      closed.push(transport)
      return Promise.resolve()
    }
  }) satisfies ManagedCertificationPort

test("orchestration runs stdio then HTTP and closes both injected ports", async () => {
  const connected: Array<CertificationTransport> = []
  const closed: Array<CertificationTransport> = []

  const reports = await runCertificationTransports(
    {
      connect: (transport) => {
        connected.push(transport)
        return Promise.resolve(passingManagedPort(closed, transport))
      }
    },
    { phase: "active", project: ProjectIdentifier.make("HULY"), runId: CertificationRunId.make("orchestration-run") }
  )

  expect(connected).toEqual(["stdio", "http"])
  expect(closed).toEqual(["stdio", "http"])
  expect(reports.map(({ phase, transport }) => ({ phase, transport }))).toEqual([
    { phase: "active", transport: "stdio" },
    { phase: "active", transport: "http" }
  ])
  expect(isCertificationSuccessful(reports, { capturedArtifactsChecked: 2, secretDetected: false })).toBe(true)
  expect(isCertificationSuccessful(reports, { capturedArtifactsChecked: 2, secretDetected: true })).toBe(false)
})

test("orchestration closes the active port when a workflow call rejects", async () => {
  const closed: Array<CertificationTransport> = []
  const broken: ManagedCertificationPort = {
    port: { call: () => Promise.reject(new Error("port defect")) },
    close: () => {
      closed.push("stdio")
      return Promise.resolve()
    }
  }

  await expect(
    runCertificationTransports(
      { connect: () => Promise.resolve(broken) },
      { phase: "active", project: ProjectIdentifier.make("HULY"), runId: CertificationRunId.make("failed-run") }
    )
  ).rejects.toThrow("port defect")
  expect(closed).toEqual(["stdio"])
})

test("orchestration runs revoked probes and fails uncertain outcomes", async () => {
  const closed: Array<CertificationTransport> = []
  const uncertainPort = (transport: CertificationTransport): ManagedCertificationPort => ({
    port: { call: () => Promise.resolve({ _tag: "Uncertain", message: "timed out" }) },
    close: () => {
      closed.push(transport)
      return Promise.resolve()
    }
  })

  const reports = await runCertificationTransports(
    { connect: (transport) => Promise.resolve(uncertainPort(transport)) },
    {
      phase: "revoked",
      attachmentId: AttachmentId.make("attachment-fixture"),
      document: DocumentIdentifier.make("document-fixture"),
      teamspace: TeamspaceIdentifier.make("teamspace-fixture")
    }
  )

  expect(closed).toEqual(["stdio", "http"])
  expect(reports.every(({ phase }) => phase === "revoked")).toBe(true)
  expect(isCertificationSuccessful(reports, { capturedArtifactsChecked: 2, secretDetected: false })).toBe(false)
})

test("revoked certification succeeds only when every service call fails", async () => {
  const input = RevokedOrchestrationInputSchema.make({
    phase: "revoked",
    attachmentId: AttachmentId.make("attachment-fixture"),
    document: DocumentIdentifier.make("document-fixture"),
    teamspace: TeamspaceIdentifier.make("teamspace-fixture")
  })
  const failedReports = await runCertificationTransports(
    {
      connect: () =>
        Promise.resolve({
          port: { call: () => Promise.resolve({ _tag: "Failure", message: "Request failed." }) },
          close: () => Promise.resolve()
        })
    },
    input
  )
  const acceptedReports = await runCertificationTransports(
    { connect: (transport) => Promise.resolve(passingManagedPort([], transport)) },
    input
  )

  expect(isCertificationSuccessful(failedReports, { capturedArtifactsChecked: 2, secretDetected: false })).toBe(true)
  expect(isCertificationSuccessful(acceptedReports, { capturedArtifactsChecked: 2, secretDetected: false })).toBe(false)
})
