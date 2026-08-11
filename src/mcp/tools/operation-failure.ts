import type { ParseResult } from "effect"
import { Cause, Chunk, Data } from "effect"

import type { ToolWarning } from "../../domain/schemas/tool-warnings.js"
import type { HulyDomainError } from "../../huly/errors.js"
import { domainErrorMessage, formatParseError } from "../error-mapping.js"
import { classifyDomainFailure } from "./domain-failure-classification.js"

export class ToolParseFailure extends Data.TaggedError("ToolParseFailure")<{
  readonly cause: Cause.Cause<ParseResult.ParseError>
  readonly toolName: string
}> {}

export class ToolDomainFailure extends Data.TaggedError("ToolDomainFailure")<{
  readonly cause: Cause.Cause<HulyDomainError>
  readonly warnings: ReadonlyArray<ToolWarning>
}> {}

export class ToolProvisionFailure extends Data.TaggedError("ToolProvisionFailure")<{
  readonly error: HulyDomainError
}> {}

export class ToolOutputFailure extends Data.TaggedError("ToolOutputFailure")<{
  readonly toolName: string
  readonly warnings: ReadonlyArray<ToolWarning>
}> {}

export type ToolOperationFailure = ToolDomainFailure | ToolOutputFailure | ToolParseFailure | ToolProvisionFailure

export type OperationFailureKind =
  | "ambiguity"
  | "authentication"
  | "authorization"
  | "conflict"
  | "input"
  | "integration"
  | "internal"
  | "lookup"

export interface OperationFailureDescription {
  readonly detailTag?: string
  readonly kind: OperationFailureKind
  readonly message: string
  readonly retryable: boolean
}

const firstFailureMessage = <E extends { readonly message: string }>(cause: Cause.Cause<E>): string | undefined => {
  if (Cause.isFailType(cause)) return cause.error.message
  return Chunk.toArray(Cause.failures(cause))[0]?.message
}

export const formatOperationFailure = (failure: ToolOperationFailure): string => {
  switch (failure._tag) {
    case "ToolDomainFailure":
      return firstFailureMessage(failure.cause) ?? "An unexpected error occurred"
    case "ToolOutputFailure":
      return `Tool ${failure.toolName} produced invalid output`
    case "ToolParseFailure": {
      if (Cause.isFailType(failure.cause)) {
        return `Invalid parameters for ${failure.toolName}: ${formatParseError(failure.cause.error)}`
      }
      const firstFailure = Chunk.toArray(Cause.failures(failure.cause))[0]
      return firstFailure === undefined
        ? "An unexpected error occurred"
        : `Invalid parameters for ${failure.toolName}: ${formatParseError(firstFailure)}`
    }
    case "ToolProvisionFailure":
      return failure.error.message
  }
}

const domainFailureDescription = (error: HulyDomainError): OperationFailureDescription => {
  const kind = classifyDomainFailure(error)
  const message =
    kind === "authentication"
      ? "Authentication failed. Check the configured Huly credentials and workspace."
      : kind === "integration"
        ? domainErrorMessage(error)
        : error.message
  return {
    detailTag: error._tag,
    kind,
    message,
    retryable: error._tag === "HulyConnectionError" || error._tag === "HulyUnavailableError"
  }
}

export const describeOperationFailure = (failure: ToolOperationFailure): OperationFailureDescription => {
  switch (failure._tag) {
    case "ToolDomainFailure": {
      const domainFailure = Chunk.toArray(Cause.failures(failure.cause))[0]
      return domainFailure === undefined
        ? { kind: "internal", message: "An unexpected error occurred.", retryable: false }
        : domainFailureDescription(domainFailure)
    }
    case "ToolOutputFailure":
      return {
        detailTag: failure._tag,
        kind: "internal",
        message: `Tool ${failure.toolName} produced invalid output.`,
        retryable: false
      }
    case "ToolParseFailure":
      return { detailTag: failure._tag, kind: "input", message: formatOperationFailure(failure), retryable: false }
    case "ToolProvisionFailure":
      return domainFailureDescription(failure.error)
  }
}
