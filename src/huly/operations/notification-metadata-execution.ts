import { Effect, type Result } from "effect"

import type { Count } from "../../domain/schemas/shared.js"
import type { HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import type { ModelMetadataFailure } from "./notification-metadata-warnings.js"

export interface ParsedRows<A> {
  readonly rows: ReadonlyArray<A>
  readonly invalidRows: Count
}

export interface NotificationMetadataResult<A> {
  readonly rows: ReadonlyArray<A>
  readonly authoritative: boolean
}

type ModelMetadataLookup = Result.Result<ReadonlyArray<unknown>, HulyClientError>

interface InvalidRowsWarning {
  readonly invalidRows: Count
}

interface FallbackWarning extends InvalidRowsWarning {
  readonly modelFailure: ModelMetadataFailure
}

const modelMetadataFailure = <A>(
  result: ModelMetadataLookup,
  rows: ParsedRows<A> | undefined
): ModelMetadataFailure => {
  if (result._tag === "Failure") return "unavailable"
  return rows?.invalidRows === 0 ? "empty" : "invalid"
}

type MetadataLoadOperations<A> = {
  readonly loadModelRows: () => Effect.Effect<ReadonlyArray<unknown>, HulyClientError>
  readonly loadRemoteRows: () => Effect.Effect<ReadonlyArray<unknown>, HulyClientError>
  readonly parse: (rows: ReadonlyArray<unknown>) => ParsedRows<A>
  readonly warnInvalidModelRows: (warning: InvalidRowsWarning) => Effect.Effect<void, never, Diagnostics>
  readonly warnFallback: (warning: FallbackWarning) => Effect.Effect<void, never, Diagnostics>
}

export const executeMetadataLoad = <A>(
  operations: MetadataLoadOperations<A>
): Effect.Effect<NotificationMetadataResult<A>, HulyClientError, Diagnostics> =>
  Effect.gen(function* () {
    const modelResult = yield* Effect.result(operations.loadModelRows())
    const modelRows = modelResult._tag === "Success" ? operations.parse(modelResult.success) : undefined
    if (modelRows !== undefined && modelRows.rows.length > 0) {
      yield* operations.warnInvalidModelRows({ invalidRows: modelRows.invalidRows })
      return { rows: modelRows.rows, authoritative: true }
    }

    const parsedRemoteRows = operations.parse(yield* operations.loadRemoteRows())
    const failure = modelMetadataFailure(modelResult, modelRows)
    yield* operations.warnFallback({ modelFailure: failure, invalidRows: parsedRemoteRows.invalidRows })
    return { rows: parsedRemoteRows.rows, authoritative: false }
  })

type MetadataIdOperations<A extends { readonly _id: Identifier }, Identifier extends string, E> = {
  readonly loadModelRows: () => Effect.Effect<ReadonlyArray<unknown>, HulyClientError>
  readonly loadRemoteRows: () => Effect.Effect<ReadonlyArray<unknown>, HulyClientError>
  readonly parse: (rows: ReadonlyArray<unknown>) => ParsedRows<A>
  readonly findIdentifier: (rows: ReadonlyArray<A>) => Identifier | undefined
  readonly notFound: () => E
  readonly warnInvalidModelRows: (warning: InvalidRowsWarning) => Effect.Effect<void, never, Diagnostics>
  readonly warnFallback: (warning: FallbackWarning) => Effect.Effect<void, never, Diagnostics>
  readonly warnTrustedIdentifier: () => Effect.Effect<void, never, Diagnostics>
  readonly trustedIdentifier: () => Identifier
}

export const executeMetadataIdRequirement = <A extends { readonly _id: Identifier }, Identifier extends string, E>(
  operations: MetadataIdOperations<A, Identifier, E>
): Effect.Effect<Identifier, HulyClientError | E, Diagnostics> =>
  Effect.gen(function* () {
    // Model operations are local/in-memory. Decode the complete authoritative definition set here:
    // list limits are presentation concerns and must never make a valid update identifier disappear.
    const modelResult = yield* Effect.result(operations.loadModelRows())
    const modelRows = modelResult._tag === "Success" ? operations.parse(modelResult.success) : undefined
    if (modelRows !== undefined && modelRows.rows.length > 0) {
      yield* operations.warnInvalidModelRows({ invalidRows: modelRows.invalidRows })
      const modelIdentifier = operations.findIdentifier(modelRows.rows)
      if (modelIdentifier !== undefined) return modelIdentifier
      return yield* Effect.fail(operations.notFound())
    }

    const parsedRemoteRows = operations.parse(yield* operations.loadRemoteRows())
    const failure = modelMetadataFailure(modelResult, modelRows)
    yield* operations.warnFallback({ modelFailure: failure, invalidRows: parsedRemoteRows.invalidRows })
    const remoteIdentifier = operations.findIdentifier(parsedRemoteRows.rows)
    if (remoteIdentifier !== undefined) return remoteIdentifier
    yield* operations.warnTrustedIdentifier()
    return operations.trustedIdentifier()
  })
