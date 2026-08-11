import { Redacted } from "effect"
import { expect, test } from "vitest"

import {
  CertificationCaptureLedger,
  redactCertificationSecret
} from "../../scripts/api-token-certification-security.js"

test("redacts every token occurrence without exposing it through string conversion", () => {
  const token = Redacted.make("operator-secret-token")

  expect(redactCertificationSecret("before operator-secret-token after operator-secret-token", token)).toBe(
    "before [REDACTED] after [REDACTED]"
  )
})

test("capture ledger retains only sanitized diagnostics and records secret detection", () => {
  const token = Redacted.make("operator-secret-token")
  const ledger = new CertificationCaptureLedger(token)

  ledger.observe("stdio-stderr", "connection failed for operator-secret-token")
  ledger.observe("http-stdout", "safe output")

  expect(ledger.summary()).toEqual({ capturedArtifactsChecked: 2, secretDetected: true })
  expect(ledger.diagnostics()).toEqual(["stdio-stderr: connection failed for [REDACTED]", "http-stdout: safe output"])
  expect(JSON.stringify(ledger.diagnostics())).not.toContain("operator-secret-token")
})

test("capture ledger ignores empty sanitized diagnostics", () => {
  const ledger = new CertificationCaptureLedger(Redacted.make("operator-secret-token"))

  ledger.observe("stdio-stderr", "   ")

  expect(ledger.diagnostics()).toEqual([])
  expect(ledger.summary()).toEqual({ capturedArtifactsChecked: 1, secretDetected: false })
})

test("capture ledger detects and redacts a token split across process chunks", () => {
  const ledger = new CertificationCaptureLedger(Redacted.make("operator-secret-token"))

  ledger.observe("stdio-stderr", "connection failed for operator-secret-")
  ledger.observe("stdio-stderr", "token\nnext line")

  expect(ledger.summary()).toEqual({ capturedArtifactsChecked: 2, secretDetected: true })
  expect(ledger.diagnostics()).toEqual(["stdio-stderr: connection failed for [REDACTED]", "stdio-stderr: next line"])
})

test("capture ledger scans structured results without retaining their contents", () => {
  const ledger = new CertificationCaptureLedger(Redacted.make("operator-secret-token"))

  ledger.inspect('{"token":"operator-secret-token","project":"private"}')

  expect(ledger.summary()).toEqual({ capturedArtifactsChecked: 1, secretDetected: true })
  expect(ledger.diagnostics()).toEqual([])
})
