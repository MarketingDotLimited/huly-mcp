import { NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"

import { runCliFailureBoundary } from "../../../packages/huly-cli/src/failure-boundary.js"
import type { CliInputError } from "../../../packages/huly-cli/src/input.js"
import type { CliRuntimeError } from "../../../packages/huly-cli/src/render.js"

const isKnown = (_error: unknown): _error is CliInputError | CliRuntimeError => false

NodeRuntime.runMain(runCliFailureBoundary(Effect.die(new Error("secret defect detail")), true, isKnown), {
  disablePrettyLogger: true
})
