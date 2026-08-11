import { describe, expect, it } from "vitest"

import { failureFromOperation, presentCliFailure } from "../../packages/huly-cli/src/failures.js"
import { CliInputError } from "../../packages/huly-cli/src/input.js"
import { CliRuntimeError } from "../../packages/huly-cli/src/render.js"

const isKnownCliError = (error: unknown): error is CliInputError | CliRuntimeError =>
  error instanceof CliInputError || error instanceof CliRuntimeError

describe("CLI automation failure contract", () => {
  it.each([
    { error: new CliInputError({ message: "bad input" }), code: "INVALID_INPUT", exitStatus: 2, retryable: false },
    {
      error: new CliRuntimeError({ kind: "authentication", message: "Authentication failed.", retryable: false }),
      code: "AUTHENTICATION_FAILED",
      exitStatus: 3,
      retryable: false
    },
    {
      error: new CliRuntimeError({ kind: "authorization", message: "Permission denied.", retryable: false }),
      code: "AUTHORIZATION_DENIED",
      exitStatus: 4,
      retryable: false
    },
    {
      error: new CliRuntimeError({ kind: "lookup", message: "Issue not found.", retryable: false }),
      code: "NOT_FOUND",
      exitStatus: 5,
      retryable: false
    },
    {
      error: new CliRuntimeError({ kind: "ambiguity", message: "Multiple issues matched.", retryable: false }),
      code: "AMBIGUOUS_RESULT",
      exitStatus: 5,
      retryable: false
    },
    {
      error: new CliRuntimeError({ kind: "conflict", message: "Already exists.", retryable: false }),
      code: "CONFLICT",
      exitStatus: 5,
      retryable: false
    },
    {
      error: new CliRuntimeError({ kind: "integration", message: "Service unavailable.", retryable: true }),
      code: "INTEGRATION_FAILED",
      exitStatus: 1,
      retryable: true
    }
  ])("maps $code to stable JSON and exit status", ({ code, error, exitStatus, retryable }) => {
    const presentation = presentCliFailure(error, true, isKnownCliError)

    expect(presentation.exitStatus).toBe(exitStatus)
    expect(JSON.parse(presentation.stderr)).toMatchObject({ code, retryable })
  })

  it("keeps human failures actionable and emits no stdout payload", () => {
    const presentation = presentCliFailure(new CliInputError({ message: "Use --project." }), false, isKnownCliError)

    expect(presentation).toEqual({ exitStatus: 2, stderr: "Use --project." })
  })

  it("redacts unknown defect details and gives defects a distinct status", () => {
    const presentation = presentCliFailure(new Error("token=super-secret"), true, isKnownCliError)

    expect(presentation.exitStatus).toBe(70)
    expect(presentation.stderr).not.toContain("super-secret")
    expect(JSON.parse(presentation.stderr)).toEqual({
      code: "INTERNAL_ERROR",
      message: "The CLI encountered an internal error.",
      retryable: false
    })
  })

  it("includes safe typed detail tags when an operation provides one", () => {
    expect(
      failureFromOperation({ detailTag: "ProjectNotFoundError", kind: "lookup", message: "Missing.", retryable: false })
    ).toMatchObject({ details: { tag: "ProjectNotFoundError" } })
  })
})
