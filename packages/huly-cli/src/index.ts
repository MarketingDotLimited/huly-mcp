#!/usr/bin/env node
import { Command, HelpDoc, ValidationError } from "@effect/cli"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Console, Effect, Layer, Logger, LogLevel, Option } from "effect"

import { TelemetryService } from "../../../src/telemetry/telemetry.js"
import { buildRootCommand } from "./command-tree.js"
import { runCliFailureBoundary } from "./failure-boundary.js"
import { renderCliHelp } from "./help.js"
import { parseCliHelpRequest } from "./help-schema.js"
import { CliInputError } from "./input.js"
import { LocalCliService } from "./local-commands.js"
import { CliRuntimeError } from "./render.js"

declare const PKG_VERSION: unknown

const cliVersion = typeof PKG_VERSION === "string" ? PKG_VERSION : "0.43.0"
const NODE_ARGUMENT_OFFSET = 2
const cliLoggerLayer = Logger.replace(Logger.defaultLogger, Logger.prettyLogger({ stderr: true }))

const makeCli = (argv: ReadonlyArray<string>) =>
  Command.run(buildRootCommand(argv), { name: "Huly CLI", version: cliVersion })

const runEffectCli = (argv: ReadonlyArray<string>) =>
  Console.consoleWith((runtimeConsole) =>
    makeCli(argv)(process.argv).pipe(
      Console.withConsole({ ...runtimeConsole, error: () => Effect.void }),
      Effect.mapError((error) =>
        ValidationError.isValidationError(error)
          ? new CliInputError({ message: HelpDoc.toAnsiText(error.error) })
          : error
      )
    )
  )

const isKnownCliError = (error: unknown): error is CliInputError | CliRuntimeError =>
  error instanceof CliInputError || error instanceof CliRuntimeError

const argv = process.argv.slice(NODE_ARGUMENT_OFFSET)

const main = Effect.suspend(() => {
  return Effect.gen(function* () {
    const helpRequest = yield* parseCliHelpRequest({
      argv,
      version: cliVersion,
      terminalColumns: process.stdout.columns
    })
    const help = Option.flatMap(helpRequest, renderCliHelp)
    return yield* Option.match(help, { onNone: () => runEffectCli(argv), onSome: Console.log })
  })
}).pipe(
  Logger.withMinimumLogLevel(LogLevel.Warning),
  Effect.provide(
    Layer.mergeAll(NodeContext.layer, TelemetryService.cliLayer, LocalCliService.defaultLayer, cliLoggerLayer)
  ),
  (program) => runCliFailureBoundary(program, argv.includes("--json"), isKnownCliError)
)

const isMainModule = (() => {
  if (typeof require !== "undefined" && require.main === module) return true
  return false
})()

if (isMainModule) {
  NodeRuntime.runMain(main, { disablePrettyLogger: true })
}
