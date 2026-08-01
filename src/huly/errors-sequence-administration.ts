import { Schema } from "effect"

import { HulySequenceId, HulySequenceValue } from "../domain/schemas/sdk-discovery-configurations.js"
import { SequenceIdentifier } from "../domain/schemas/sequence-administration.js"
import { HulyAttributeId, ObjectClassName } from "../domain/schemas/shared.js"

const MINIMUM_AMBIGUOUS_MATCHES = 2
const SequenceWriteOperation = Schema.Literal("create", "update custom prefix", "delete")

export class SequenceDefinitionConflictError extends Schema.TaggedError<SequenceDefinitionConflictError>()(
  "SequenceDefinitionConflictError",
  { classId: ObjectClassName, existingSequenceId: HulySequenceId }
) {
  override get message(): string {
    return `Class '${this.classId}' already has sequence '${this.existingSequenceId}' with a different sequence kind or custom prefix`
  }
}

export class SequenceConcurrentWriteError extends Schema.TaggedError<SequenceConcurrentWriteError>()(
  "SequenceConcurrentWriteError",
  { operation: SequenceWriteOperation, sequenceId: HulySequenceId }
) {
  override get message(): string {
    return `Sequence '${this.sequenceId}' changed while attempting to ${this.operation}; inspect list_huly_sequences before retrying`
  }
}

export class SequenceNotFoundError extends Schema.TaggedError<SequenceNotFoundError>()("SequenceNotFoundError", {
  identifier: SequenceIdentifier
}) {
  override get message(): string {
    return `Sequence '${this.identifier}' not found; use list_huly_sequences to discover an exact sequence ID or attached class`
  }
}

export class SequenceIdentifierAmbiguousError extends Schema.TaggedError<SequenceIdentifierAmbiguousError>()(
  "SequenceIdentifierAmbiguousError",
  {
    identifier: SequenceIdentifier,
    matches: Schema.Array(HulySequenceId).pipe(Schema.minItems(MINIMUM_AMBIGUOUS_MATCHES))
  }
) {
  override get message(): string {
    return `Sequence '${this.identifier}' is ambiguous; pass one of these exact IDs: ${this.matches.join(", ")}`
  }
}

export class SequenceKindUnsupportedError extends Schema.TaggedError<SequenceKindUnsupportedError>()(
  "SequenceKindUnsupportedError",
  { sequenceId: HulySequenceId }
) {
  override get message(): string {
    return `Sequence '${this.sequenceId}' is not a custom sequence; prefix updates are supported only for core CustomSequence records`
  }
}

export class SequenceCurrentValueMismatchError extends Schema.TaggedError<SequenceCurrentValueMismatchError>()(
  "SequenceCurrentValueMismatchError",
  { sequenceId: HulySequenceId, expected: HulySequenceValue, actual: HulySequenceValue }
) {
  override get message(): string {
    return `Sequence '${this.sequenceId}' is at ${this.actual}, not expected value ${this.expected}; inspect list_huly_sequences before retrying deletion`
  }
}

export class SequenceInUseError extends Schema.TaggedError<SequenceInUseError>()("SequenceInUseError", {
  sequenceId: HulySequenceId,
  attributeIds: Schema.Array(HulyAttributeId).pipe(Schema.minItems(1))
}) {
  override get message(): string {
    return `Custom sequence '${this.sequenceId}' cannot be deleted because identifier attributes reference it: ${this.attributeIds.join(", ")}`
  }
}

export const SequenceAdministrationDomainError = Schema.Union(
  SequenceDefinitionConflictError,
  SequenceConcurrentWriteError,
  SequenceNotFoundError,
  SequenceIdentifierAmbiguousError,
  SequenceKindUnsupportedError,
  SequenceCurrentValueMismatchError,
  SequenceInUseError
)
