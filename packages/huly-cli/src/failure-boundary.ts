import { Console, Effect } from "effect"

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
    Effect.zipRight(
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
  program.pipe(
    Effect.catchAll((error) => emitFailure(error, json, isKnown)),
    Effect.catchAllDefect((defect) => emitFailure(defect, json, isKnown))
  )
