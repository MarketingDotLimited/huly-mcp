#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Console, Effect, Layer, Option } from "effect"
import { CliError, Command } from "effect/unstable/cli"

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
const GLOBAL_BOOLEAN_FLAGS = new Set(["--json", "--yes"])
const GLOBAL_TEXT_FLAGS = new Set(["--input-json", "--input-file", "--output"])

const moveGlobalOptionsToLeaf = (argv: ReadonlyArray<string>): ReadonlyArray<string> => {
  const command: Array<string> = []
  const globals: Array<string> = []
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === undefined) continue
    const flag = token.split("=", 1)[0]
    const isText = flag !== undefined && GLOBAL_TEXT_FLAGS.has(flag)
    const isBoolean = flag !== undefined && GLOBAL_BOOLEAN_FLAGS.has(flag)
    if (!isText && !isBoolean) {
      command.push(token)
      continue
    }
    globals.push(token)
    const next = argv[index + 1]
    const takesFollowingValue =
      !token.includes("=") && next !== undefined && (isText || (isBoolean && ["true", "false"].includes(next)))
    if (takesFollowingValue) {
      globals.push(next)
      index += 1
    }
  }
  return [...command, ...globals]
}

const makeCli = (argv: ReadonlyArray<string>) =>
  Command.runWith(buildRootCommand(argv), { version: cliVersion, renderErrors: false })(moveGlobalOptionsToLeaf(argv))

export const runEffectCli = (argv: ReadonlyArray<string>) =>
  Console.consoleWith((currentConsole) => {
    const bufferedLogs: Array<ReadonlyArray<unknown>> = []
    const bufferedConsole = Object.assign(Object.create(currentConsole), {
      log: (...args: ReadonlyArray<unknown>) => {
        bufferedLogs.push(args)
      }
    })
    return makeCli(argv).pipe(
      Effect.provideService(Console.Console, bufferedConsole),
      Effect.tap(() => Effect.sync(() => bufferedLogs.forEach((args) => currentConsole.log(...args))))
    )
  }).pipe(
    Effect.catch((error) => {
      if (!CliError.isCliError(error)) return Effect.fail(error)
      if (error._tag === "ShowHelp" && error.errors.length === 0) return Effect.void
      const message =
        error._tag === "ShowHelp" ? error.errors.map((nested) => nested.message).join("; ") : error.message
      const parityMessage =
        error._tag === "ShowHelp" &&
        error.errors.some(
          (nested) => nested instanceof CliError.InvalidValue && nested.kind === "flag" && nested.option === "json"
        )
          ? "Received unknown argument for --json."
          : message
      return Effect.fail(new CliInputError({ message: parityMessage }))
    })
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
  Effect.provide(Layer.mergeAll(NodeServices.layer, TelemetryService.cliLayer, LocalCliService.defaultLayer)),
  (program) => runCliFailureBoundary(program, argv.includes("--json"), isKnownCliError)
)

const isMainModule = (() => {
  if (typeof require !== "undefined" && require.main === module) return true
  return false
})()

if (isMainModule) {
  NodeRuntime.runMain(main, { disableErrorReporting: true })
}
