import { Console, Effect, Exit } from "effect"

import { findRecoverableCauseFailure } from "../../../src/runtime/cause-exit.js"

import { presentCliFailure } from "./failures.js"
import type { CliInputError } from "./input.js"
import type { CliRuntimeError } from "./render.js"

type KnownCliError = CliInputError | CliRuntimeError

const emitFailure = (
  error: unknown,
  json: boolean,
  isKnown: (error: unknown) => error is KnownCliError
): Effect.Effect<void> => {
  const presentation = presentCliFailure(error, json, isKnown)
  return Console.error(presentation.stderr).pipe(
    Effect.andThen(
      Effect.sync(() => {
        process.exitCode = presentation.exitStatus
      })
    )
  )
}

export const runCliFailureBoundary = <A, E, R>(
  program: Effect.Effect<A, E, R>,
  json: boolean,
  isKnown: (error: unknown) => error is KnownCliError
): Effect.Effect<A | void, never, R> =>
  Effect.exit(program).pipe(
    Effect.flatMap((exit) => {
      if (Exit.isSuccess(exit)) return Effect.succeed(exit.value)
      const knownFailure = findRecoverableCauseFailure(exit.cause, isKnown)
      return emitFailure(knownFailure, json, isKnown)
    })
  )
