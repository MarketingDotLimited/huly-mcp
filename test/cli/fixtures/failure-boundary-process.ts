import { NodeRuntime } from "@effect/platform-node"
import { Cause, Effect, Schema } from "effect"

import { runCliFailureBoundary } from "../../../packages/huly-cli/src/failure-boundary.js"
import type { CliInputError } from "../../../packages/huly-cli/src/input.js"
import type { CliRuntimeError } from "../../../packages/huly-cli/src/render.js"
import { FailureBoundaryScenarioSchema, type FailureBoundaryScenario } from "./failure-boundary-scenarios.js"

type KnownCliError = CliInputError | CliRuntimeError

class FixtureCliInputError extends Schema.TaggedError<FixtureCliInputError>()("CliInputError", {
  message: Schema.String
}) {}

const isKnown = (error: unknown): error is KnownCliError => error instanceof FixtureCliInputError

const programFor = (scenario: FailureBoundaryScenario): Effect.Effect<void, KnownCliError | string> => {
  switch (scenario) {
    case "known":
      return Effect.fail(new FixtureCliInputError({ message: "known input failure" }))
    case "defect":
      return Effect.failCause(Cause.die(new Error("secret defect detail")))
    case "interrupt":
      return Effect.failCause(Cause.interrupt())
    case "empty":
      return Effect.failCause(Cause.empty)
    case "mixed":
      return Effect.failCause(
        Cause.fromReasons<string | FixtureCliInputError>([
          Cause.makeDieReason(new Error("secret mixed defect")),
          Cause.makeFailReason("secret unknown failure"),
          Cause.makeInterruptReason(),
          Cause.makeFailReason(new FixtureCliInputError({ message: "first known failure" })),
          Cause.makeFailReason(new FixtureCliInputError({ message: "second known failure" }))
        ])
      )
  }
}

const scenario = Schema.decodeUnknownSync(FailureBoundaryScenarioSchema)(process.argv[2])

NodeRuntime.runMain(runCliFailureBoundary(programFor(scenario), true, isKnown), { disableErrorReporting: true })
