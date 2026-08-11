import { Schema } from "effect"

import type { OperationFailureDescription, OperationFailureKind } from "../../../src/mcp/tools/registry.js"
import type { CliInputError } from "./input.js"
import type { CliRuntimeError } from "./render.js"

const EXIT_INTEGRATION = 1
const EXIT_INPUT = 2
const EXIT_AUTHENTICATION = 3
const EXIT_AUTHORIZATION = 4
const EXIT_DOMAIN = 5
const EXIT_INTERNAL = 70

export const CliFailureCodeSchema = Schema.Literal(
  "INVALID_INPUT",
  "AUTHENTICATION_FAILED",
  "AUTHORIZATION_DENIED",
  "NOT_FOUND",
  "AMBIGUOUS_RESULT",
  "CONFLICT",
  "INTEGRATION_FAILED",
  "INTERNAL_ERROR"
)
export type CliFailureCode = Schema.Schema.Type<typeof CliFailureCodeSchema>

export const CliFailureDetailsSchema = Schema.Struct({ tag: Schema.String })
export const CliFailureSchema = Schema.Struct({
  code: CliFailureCodeSchema,
  message: Schema.String,
  retryable: Schema.Boolean,
  hint: Schema.optionalWith(Schema.String, { exact: true }),
  details: Schema.optionalWith(CliFailureDetailsSchema, { exact: true })
})
export type CliFailure = Schema.Schema.Type<typeof CliFailureSchema>

export const CliExitStatusSchema = Schema.Literal(
  EXIT_INTEGRATION,
  EXIT_INPUT,
  EXIT_AUTHENTICATION,
  EXIT_AUTHORIZATION,
  EXIT_DOMAIN,
  EXIT_INTERNAL
)
export type CliExitStatus = Schema.Schema.Type<typeof CliExitStatusSchema>

export interface CliFailurePresentation {
  readonly exitStatus: CliExitStatus
  readonly stderr: string
}

interface CliFailureContractEntry {
  readonly code: CliFailureCode
  readonly exitStatus: CliExitStatus
  readonly hint?: string
}

export const CLI_FAILURE_CONTRACT = {
  input: {
    code: "INVALID_INPUT",
    exitStatus: EXIT_INPUT,
    hint: "Run the command with --help and correct the supplied arguments."
  },
  authentication: {
    code: "AUTHENTICATION_FAILED",
    exitStatus: EXIT_AUTHENTICATION,
    hint: "Run `huly auth status` to inspect the active sanitized configuration."
  },
  authorization: {
    code: "AUTHORIZATION_DENIED",
    exitStatus: EXIT_AUTHORIZATION,
    hint: "Ask a Huly workspace administrator to verify your role and permissions."
  },
  lookup: { code: "NOT_FOUND", exitStatus: EXIT_DOMAIN },
  ambiguity: { code: "AMBIGUOUS_RESULT", exitStatus: EXIT_DOMAIN },
  conflict: { code: "CONFLICT", exitStatus: EXIT_DOMAIN },
  integration: {
    code: "INTEGRATION_FAILED",
    exitStatus: EXIT_INTEGRATION,
    hint: "Verify Huly URL, workspace, network access, and service availability."
  },
  internal: { code: "INTERNAL_ERROR", exitStatus: EXIT_INTERNAL }
} as const satisfies Record<OperationFailureKind, CliFailureContractEntry>

export const failureFromOperation = (description: OperationFailureDescription): CliFailure => {
  const contract: CliFailureContractEntry = CLI_FAILURE_CONTRACT[description.kind]
  return Schema.decodeUnknownSync(CliFailureSchema)({
    code: contract.code,
    message: description.message,
    retryable: description.retryable,
    ...(description.detailTag === undefined ? {} : { details: { tag: description.detailTag } }),
    ...(contract.hint === undefined ? {} : { hint: contract.hint })
  })
}

const failureFromKnownError = (error: CliInputError | CliRuntimeError): CliFailure => {
  const kind: OperationFailureKind = error._tag === "CliInputError" ? "input" : error.kind
  const retryable = error._tag === "CliInputError" ? false : error.retryable
  return failureFromOperation({ kind, message: error.message, retryable })
}

const internalFailure = (): CliFailure =>
  Schema.decodeUnknownSync(CliFailureSchema)({
    code: "INTERNAL_ERROR",
    message: "The CLI encountered an internal error.",
    retryable: false
  })

export const presentCliFailure = (
  error: unknown,
  json: boolean,
  isKnown: (error: unknown) => error is CliInputError | CliRuntimeError
): CliFailurePresentation => {
  const known = isKnown(error)
  const failure = known ? failureFromKnownError(error) : internalFailure()
  const kind: OperationFailureKind = known ? (error._tag === "CliInputError" ? "input" : error.kind) : "internal"
  return {
    exitStatus: CLI_FAILURE_CONTRACT[kind].exitStatus,
    stderr: json ? JSON.stringify(Schema.encodeSync(CliFailureSchema)(failure)) : failure.message
  }
}
