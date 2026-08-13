import { Effect, Option, Schema } from "effect"

import { PositiveInteger } from "../../../src/domain/schemas/shared.js"
import { CliCommandPath } from "./command-schema.js"
import type { CliCommandPath as CliCommandPathType } from "./command-schema.js"

const DEFAULT_HELP_WIDTH = 100
const MAXIMUM_HELP_WIDTH = 160
const LAST_ARGUMENT_OFFSET = -1

export const CliPackageVersion = Schema.String.pipe(
  Schema.check(Schema.isNonEmpty()),
  Schema.brand("CliPackageVersion"),
  Schema.annotate({ identifier: "CliPackageVersion", description: "The package version displayed by CLI help." })
)
export type CliPackageVersion = Schema.Schema.Type<typeof CliPackageVersion>

export const CliHelpWidth = PositiveInteger.pipe(
  Schema.check(Schema.isLessThanOrEqualTo(MAXIMUM_HELP_WIDTH)),
  Schema.brand("CliHelpWidth"),
  Schema.annotate({ identifier: "CliHelpWidth", description: "The terminal width used to render CLI help." })
)
export type CliHelpWidth = Schema.Schema.Type<typeof CliHelpWidth>

export const CliLayoutWidth = PositiveInteger.pipe(Schema.brand("CliLayoutWidth")).annotate({
  identifier: "CliLayoutWidth",
  description: "A positive width used by the CLI help layout engine."
})
export type CliLayoutWidth = Schema.Schema.Type<typeof CliLayoutWidth>

export const CliCommandCount = PositiveInteger.pipe(Schema.brand("CliCommandCount")).annotate({
  identifier: "CliCommandCount",
  description: "The positive number of commands beneath a CLI command group."
})
export type CliCommandCount = Schema.Schema.Type<typeof CliCommandCount>

export const CliHelpCommandLabel = Schema.String.pipe(
  Schema.check(Schema.isNonEmpty()),
  Schema.brand("CliHelpCommandLabel"),
  Schema.annotate({ identifier: "CliHelpCommandLabel", description: "A command label displayed in CLI help." })
)
export type CliHelpCommandLabel = Schema.Schema.Type<typeof CliHelpCommandLabel>

export const CliHelpDescription = Schema.String.pipe(
  Schema.check(Schema.isNonEmpty()),
  Schema.brand("CliHelpDescription"),
  Schema.annotate({ identifier: "CliHelpDescription", description: "Descriptive prose displayed in CLI help." })
)
export type CliHelpDescription = Schema.Schema.Type<typeof CliHelpDescription>

export const CliHelpFragment = Schema.String.pipe(
  Schema.check(Schema.isNonEmpty()),
  Schema.brand("CliHelpFragment"),
  Schema.annotate({ identifier: "CliHelpFragment", description: "A non-empty intermediate fragment of CLI help text." })
)
export type CliHelpFragment = Schema.Schema.Type<typeof CliHelpFragment>

export const CliHelpLine = Schema.String.pipe(Schema.brand("CliHelpLine")).annotate({
  identifier: "CliHelpLine",
  description: "One possibly empty line of rendered CLI help."
})
export type CliHelpLine = Schema.Schema.Type<typeof CliHelpLine>

export const RenderedCliHelp = Schema.String.pipe(
  Schema.check(Schema.isNonEmpty()),
  Schema.brand("RenderedCliHelp"),
  Schema.annotate({ identifier: "RenderedCliHelp", description: "Plain terminal-safe Huly CLI help text." })
)
export type RenderedCliHelp = Schema.Schema.Type<typeof RenderedCliHelp>

export const CliHelpRequest = Schema.Struct({
  path: CliCommandPath,
  version: CliPackageVersion,
  width: CliHelpWidth
}).annotate({ identifier: "CliHelpRequest", description: "A parsed request to render Huly CLI help." })
export type CliHelpRequest = Schema.Schema.Type<typeof CliHelpRequest>

const CliProcessHelpInput = Schema.Struct({
  argv: Schema.Array(Schema.String),
  terminalColumns: Schema.Unknown,
  version: Schema.Unknown
})
type CliProcessHelpInput = Schema.Schema.Type<typeof CliProcessHelpInput>

const CliHelpFlag = Schema.Literals(["--help", "-h"])
const TerminalColumns = Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThan(0)))
const CliHelpDisplayContext = Schema.Struct({ version: CliPackageVersion })

const normalizedTerminalColumns = (columns: unknown): CliHelpWidth => {
  const decoded = Schema.decodeUnknownOption(TerminalColumns)(columns)
  const width = Option.getOrElse(decoded, () => DEFAULT_HELP_WIDTH)
  return CliHelpWidth.make(Math.min(MAXIMUM_HELP_WIDTH, width))
}

const helpPath = (argv: ReadonlyArray<string>): Option.Option<CliCommandPathType> => {
  const flag = argv.at(LAST_ARGUMENT_OFFSET)
  if (Option.isNone(Schema.decodeUnknownOption(CliHelpFlag)(flag))) return Option.none()
  return Schema.decodeUnknownOption(CliCommandPath)(argv.slice(0, LAST_ARGUMENT_OFFSET))
}

const requestFromInput = (input: CliProcessHelpInput) =>
  Option.match(helpPath(input.argv), {
    onNone: () => Effect.succeed(Option.none<CliHelpRequest>()),
    onSome: (path) =>
      Schema.decodeUnknownEffect(CliHelpDisplayContext)({ version: input.version }).pipe(
        Effect.map((context) =>
          Option.some(
            CliHelpRequest.make({
              path,
              version: context.version,
              width: normalizedTerminalColumns(input.terminalColumns)
            })
          )
        )
      )
  })

export const parseCliHelpRequest = (input: unknown) =>
  Schema.decodeUnknownEffect(CliProcessHelpInput)(input).pipe(Effect.flatMap(requestFromInput))
