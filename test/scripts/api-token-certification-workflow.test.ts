import { expect, test } from "vitest"

import {
  AttachmentId,
  DocumentIdentifier,
  ProjectIdentifier,
  TeamspaceIdentifier
} from "../../src/domain/schemas/shared.js"
import {
  type ActiveSurfaceStatus,
  type CertificationCall,
  type CertificationCallResult,
  type CertificationPort,
  type CertificationSurface,
  type CertificationToolName,
  CertificationRunId,
  runActiveCertification,
  runRevokedCertification
} from "../../scripts/api-token-certification-workflow.js"

const success = (value: unknown = {}): CertificationCallResult => ({ _tag: "Success", value })
const failure = (message: string): CertificationCallResult => ({ _tag: "Failure", message })
const uncertain = (message: string): CertificationCallResult => ({ _tag: "Uncertain", message })
const activeOptions = (runId: string, transport: "stdio" | "http") => ({
  project: ProjectIdentifier.make("HULY"),
  runId: CertificationRunId.make(runId),
  transport
})
const revokedOptions = (transport: "stdio" | "http") => ({
  attachmentId: AttachmentId.make("attachment-fixture"),
  document: DocumentIdentifier.make("document-fixture"),
  teamspace: TeamspaceIdentifier.make("teamspace-fixture"),
  transport
})

const responseMap = (entries: ReadonlyArray<readonly [CertificationToolName, CertificationCallResult]>) =>
  new Map(entries)

const activeResponses = responseMap([
  ["list_projects", success({ projects: [{ identifier: "HULY" }] })],
  ["create_issue", success({ identifier: "HULY-42" })],
  ["update_issue", success({ identifier: "HULY-42" })],
  ["list_workspaces", success({ workspaces: [] })],
  ["add_issue_attachment", success({ attachmentId: "attachment-1" })],
  ["download_attachment", success({ attachmentId: "attachment-1" })],
  ["list_teamspaces", success({ teamspaces: [{ id: "teamspace-1", name: "Documents" }] })],
  ["create_document", success({ id: "document-1" })],
  ["edit_document", success({ id: "document-1" })],
  ["get_document", success({ documentId: "document-1", content: "certification updated" })],
  ["delete_document", success({ deleted: true })],
  ["delete_attachment", success({ deleted: true })],
  ["delete_issue", success({ deleted: true })]
])

const makePort = (responses: ReadonlyMap<CertificationToolName, CertificationCallResult>) => {
  const calls: Array<CertificationCall> = []
  const port: CertificationPort = {
    call: (request) => {
      calls.push(request)
      return Promise.resolve(responses.get(request.tool) ?? success())
    }
  }
  return { calls, port }
}

test("active certification reports every service surface and cleans confirmed writes", async () => {
  const { calls, port } = makePort(activeResponses)

  const report = await runActiveCertification(port, activeOptions("run-1", "stdio"))

  expect(report.surfaces.map(({ status, surface }) => ({ status, surface }))).toEqual([
    { status: "passed", surface: "core-rest" },
    { status: "passed", surface: "account" },
    { status: "passed", surface: "storage-file" },
    { status: "passed", surface: "collaborator-markup" }
  ])
  expect(report.cleanup).toEqual({
    issue: { _tag: "Confirmed", cleanup: "cleaned" },
    attachment: { _tag: "Confirmed", cleanup: "cleaned" },
    document: { _tag: "Confirmed", cleanup: "cleaned" }
  })
  expect(calls.slice(-3).map(({ tool }) => tool)).toEqual(["delete_document", "delete_attachment", "delete_issue"])
})

test("active certification does not retry or destructively guess after an uncertain write", async () => {
  const { calls, port } = makePort(
    responseMap([
      ["list_projects", success({ projects: [] })],
      ["create_issue", uncertain("request timed out")]
    ])
  )

  const report = await runActiveCertification(port, activeOptions("run-2", "http"))

  expect(report.cleanup).toEqual({
    issue: { _tag: "WriteUncertain" },
    attachment: { _tag: "NotCreated" },
    document: { _tag: "NotCreated" }
  })
  expect(calls.map(({ tool }) => tool)).toEqual(["list_projects", "create_issue"])
  expect(report.surfaces[0]).toMatchObject({ status: "uncertain", surface: "core-rest" })
})

test("active certification treats a successful issue response without an identifier as uncertain", async () => {
  const { calls, port } = makePort(
    responseMap([
      ["list_projects", success({ projects: [] })],
      ["create_issue", success({ malformed: true })]
    ])
  )

  const report = await runActiveCertification(port, activeOptions("run-malformed", "stdio"))

  expect(report.cleanup.issue._tag).toBe("WriteUncertain")
  expect(calls.map(({ tool }) => tool)).toEqual(["list_projects", "create_issue"])
})

test("revoked certification probes each service surface independently without writes", async () => {
  const rejected = failure("Authentication failed")
  const { calls, port } = makePort(
    responseMap([
      ["list_projects", rejected],
      ["list_workspaces", rejected],
      ["download_attachment", rejected],
      ["get_document", rejected]
    ])
  )

  const report = await runRevokedCertification(port, revokedOptions("stdio"))

  expect(report.surfaces.map(({ surface }) => surface)).toEqual([
    "core-rest",
    "account",
    "storage-file",
    "collaborator-markup"
  ])
  expect(report.surfaces.every(({ status }) => status === "call-failed")).toBe(true)
  expect(calls.map(({ kind, tool }) => ({ kind, tool }))).toEqual([
    { kind: "read", tool: "list_projects" },
    { kind: "read", tool: "list_workspaces" },
    { kind: "read", tool: "download_attachment" },
    { kind: "read", tool: "get_document" }
  ])
})

test("active certification reports independent read failures without attempting cleanup", async () => {
  const { port } = makePort(
    responseMap([
      ["list_projects", failure("core unavailable")],
      ["list_workspaces", failure("account unavailable")],
      ["list_teamspaces", failure("collaborator unavailable")]
    ])
  )

  const report = await runActiveCertification(port, activeOptions("run-3", "stdio"))

  expect(report.surfaces).toEqual([
    { detail: "core unavailable", status: "failed", surface: "core-rest" },
    { detail: "account unavailable", status: "failed", surface: "account" },
    { detail: "Storage probe requires the confirmed core issue.", status: "failed", surface: "storage-file" },
    { detail: "collaborator unavailable", status: "failed", surface: "collaborator-markup" }
  ])
  expect(report.cleanup).toEqual({
    issue: { _tag: "NotCreated" },
    attachment: { _tag: "NotCreated" },
    document: { _tag: "NotCreated" }
  })
})

test("active certification preserves downstream uncertainty and a failed confirmed cleanup", async () => {
  const responses = new Map(activeResponses)
  responses.set("update_issue", uncertain("update timed out"))
  responses.set("list_workspaces", failure("account rejected"))
  responses.set("add_issue_attachment", success({ malformed: true }))
  responses.set("list_teamspaces", success({ teamspaces: [] }))
  responses.set("delete_issue", failure("cleanup rejected"))
  const { port } = makePort(responses)

  const report = await runActiveCertification(port, activeOptions("run-4", "http"))

  expect(report.surfaces.map(({ status }) => status)).toEqual(["uncertain", "failed", "uncertain", "failed"])
  expect(report.cleanup).toEqual({
    issue: { _tag: "Confirmed", cleanup: "failed" },
    attachment: { _tag: "WriteUncertain" },
    document: { _tag: "NotCreated" }
  })
})

test("active certification distinguishes a cleanup failure from write uncertainty", async () => {
  const responses = new Map(activeResponses)
  responses.set("delete_issue", failure("cleanup rejected"))
  const { port } = makePort(responses)

  const report = await runActiveCertification(port, activeOptions("run-cleanup", "stdio"))

  expect(report.cleanup).toEqual({
    issue: { _tag: "Confirmed", cleanup: "failed" },
    attachment: { _tag: "Confirmed", cleanup: "cleaned" },
    document: { _tag: "Confirmed", cleanup: "cleaned" }
  })
})

test("active certification preserves uncertain cleanup without retrying", async () => {
  const responses = new Map(activeResponses)
  responses.set("delete_issue", uncertain("cleanup timed out"))
  const { calls, port } = makePort(responses)

  const report = await runActiveCertification(port, activeOptions("run-uncertain-cleanup", "http"))

  expect(report.cleanup).toEqual({
    issue: { _tag: "Confirmed", cleanup: "uncertain" },
    attachment: { _tag: "Confirmed", cleanup: "cleaned" },
    document: { _tag: "Confirmed", cleanup: "cleaned" }
  })
  expect(calls.filter(({ tool }) => tool === "delete_issue")).toHaveLength(1)
})

test.each([
  ["add_issue_attachment", failure("attachment rejected"), "storage-file", "failed"],
  ["add_issue_attachment", uncertain("attachment timed out"), "storage-file", "uncertain"],
  ["create_document", failure("document rejected"), "collaborator-markup", "failed"],
  ["create_document", uncertain("document timed out"), "collaborator-markup", "uncertain"],
  ["create_document", success({ malformed: true }), "collaborator-markup", "uncertain"]
] satisfies ReadonlyArray<
  readonly [CertificationToolName, CertificationCallResult, CertificationSurface, ActiveSurfaceStatus]
>)("active certification reports %s boundary outcome", async (tool, response, surface, status) => {
  const responses = new Map(activeResponses)
  responses.set(tool, response)
  const { port } = makePort(responses)

  const report = await runActiveCertification(port, activeOptions("run-5", "stdio"))

  expect(report.surfaces.find((result) => result.surface === surface)?.status).toBe(status)
})

test("revoked certification records successful and uncertain calls independently", async () => {
  const { port } = makePort(
    responseMap([
      ["list_projects", success()],
      ["list_workspaces", uncertain("account timed out")],
      ["download_attachment", success()],
      ["get_document", uncertain("collaborator timed out")]
    ])
  )

  const report = await runRevokedCertification(port, revokedOptions("http"))

  expect(report.surfaces.map(({ status }) => status)).toEqual([
    "call-succeeded",
    "uncertain",
    "call-succeeded",
    "uncertain"
  ])
})
