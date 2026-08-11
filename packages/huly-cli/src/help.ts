import { CliConfig, Command, CommandDescriptor, HelpDoc, Usage } from "@effect/cli"
import { stripVTControlCharacters } from "node:util"
import { HashMap, Option } from "effect"

import { buildCommandDescriptorAtPath } from "./command-tree.js"
import type { CliCommandSpec } from "./catalog-types.js"
import { cliCommandCatalog } from "./catalog.js"
import { CliCommandSegment, type CliCommandPath } from "./command-schema.js"
import {
  CliCommandCount,
  CliHelpCommandLabel,
  CliHelpDescription,
  CliHelpFragment,
  CliHelpLine,
  CliLayoutWidth,
  RenderedCliHelp,
  type CliHelpRequest,
  type CliHelpWidth,
  type CliPackageVersion
} from "./help-schema.js"
import { authCommand, profileCommand } from "./local-commands.js"

interface HelpRow {
  readonly command: CliHelpCommandLabel
  readonly description: CliHelpDescription
}

interface RootCommandSummary {
  readonly command: CliHelpCommandLabel
  readonly count: CliCommandCount
  readonly source: "catalog" | "local"
}

const LAST_ITEM_OFFSET = -1
const MINIMUM_INLINE_DESCRIPTION_WIDTH = 20
const DESCRIPTION_INDENT_WIDTH = 4

const wordChunks = (word: CliHelpFragment, width: CliLayoutWidth): ReadonlyArray<CliHelpFragment> =>
  word.length <= width
    ? [word]
    : [CliHelpFragment.make(word.slice(0, width)), ...wordChunks(CliHelpFragment.make(word.slice(width)), width)]

const wrappedText = (value: CliHelpFragment, width: CliLayoutWidth): ReadonlyArray<CliHelpFragment> =>
  value
    .split(/\s+/)
    .flatMap((word) => wordChunks(CliHelpFragment.make(word), width))
    .reduce<ReadonlyArray<CliHelpFragment>>((lines, word) => {
      const current = lines.at(LAST_ITEM_OFFSET)
      if (current === undefined) return [word]
      if (`${current} ${word}`.length <= width) {
        return [...lines.slice(0, LAST_ITEM_OFFSET), CliHelpFragment.make(`${current} ${word}`)]
      }
      return [...lines, word]
    }, [])

const renderRows = (rows: ReadonlyArray<HelpRow>, width: CliHelpWidth): CliHelpFragment => {
  const commandWidth = Math.max(...rows.map((row) => row.command.length))
  return CliHelpFragment.make(
    rows
      .flatMap((row) => {
        const prefix = `  ${row.command.padEnd(commandWidth)}  `
        const descriptionWidth = width - prefix.length
        if (descriptionWidth < MINIMUM_INLINE_DESCRIPTION_WIDTH) {
          const stackedWidth = CliLayoutWidth.make(Math.max(1, width - DESCRIPTION_INDENT_WIDTH))
          return [
            `  ${row.command}`,
            ...wrappedText(CliHelpFragment.make(row.description), stackedWidth).map(
              (description) => `    ${description}`
            )
          ]
        }
        const descriptions = wrappedText(CliHelpFragment.make(row.description), CliLayoutWidth.make(descriptionWidth))
        return descriptions.map(
          (description, index) => `${index === 0 ? prefix : " ".repeat(prefix.length)}${description}`
        )
      })
      .join("\n")
  )
}

export const cliRootCommandSummaries = (): ReadonlyArray<RootCommandSummary> => {
  const counts = new Map<CliCommandSegment, CliCommandCount>()
  for (const spec of Object.values(cliCommandCatalog)) {
    const group = CliCommandSegment.make(spec.path[0])
    counts.set(group, CliCommandCount.make((counts.get(group) ?? 0) + 1))
  }
  const generatedRows = [...counts.entries()].map(([group, count]) => ({
    command: CliHelpCommandLabel.make(`huly ${group}`),
    count,
    source: "catalog" as const
  }))
  const localCommandSummary = <Name extends string, R, E, A>(
    command: Command.Command<Name, R, E, A>
  ): RootCommandSummary => {
    const [name] = [...Command.getNames(command)]
    const count = HashMap.size(Command.getSubcommands(command))
    return {
      command: CliHelpCommandLabel.make(`huly ${name ?? "unknown"}`),
      count: CliCommandCount.make(count),
      source: "local"
    }
  }
  const localRows = [localCommandSummary(authCommand), localCommandSummary(profileCommand)]
  return [...localRows, ...generatedRows].sort((left, right) => left.command.localeCompare(right.command))
}

const progressiveRootRows = (): ReadonlyArray<HelpRow> =>
  cliRootCommandSummaries().map(({ command, count }) => ({
    command,
    description: CliHelpDescription.make(`${count} ${count === 1 ? "command" : "commands"}`)
  }))

const renderProgressiveRootHelp = (version: CliPackageVersion, width: CliHelpWidth): RenderedCliHelp => {
  const rows = progressiveRootRows()
  const commands = renderRows(rows, width)
  return wrapHelp(
    CliHelpFragment.make(
      [
        `Huly CLI ${version}`,
        "",
        "Usage:",
        "  huly [global options] <command> [options]",
        "",
        "Global options:",
        "  --json                       Print the operation result as JSON",
        "  --input-json <object>        Merge a JSON object into command input",
        "  --input-file <path>          Merge a JSON file into command input",
        "  --output <path>              Write supported binary output to a file",
        "  --yes                        Confirm consequential commands",
        "  --completions <shell>        Generate sh, bash, fish, or zsh completion",
        "",
        "Commands:",
        commands,
        "",
        "Run `huly <command> --help` to continue through the command tree."
      ].join("\n")
    ),
    width
  )
}

const startsWithPath = (candidate: CliCommandSpec["path"], path: CliCommandPath): boolean =>
  path.every((segment, index) => candidate[index] === segment)

const groupRows = (path: CliCommandPath): ReadonlyArray<HelpRow> => {
  const counts = new Map<CliCommandSegment, CliCommandCount>()
  const descriptions = new Map<CliCommandSegment, CliHelpDescription>()
  for (const spec of Object.values(cliCommandCatalog)) {
    if (!startsWithPath(spec.path, path)) continue
    const child = spec.path[path.length]
    /* c8 ignore start -- renderCliHelp routes exact catalog leaves to renderLeafHelp before group rendering. */
    if (child === undefined) continue
    /* c8 ignore stop */
    const segment = CliCommandSegment.make(child)
    counts.set(segment, CliCommandCount.make((counts.get(segment) ?? 0) + 1))
    const directDescription = spec.path.length === path.length + 1 ? spec.description : undefined
    if (directDescription !== undefined) descriptions.set(segment, CliHelpDescription.make(directDescription))
  }
  return [...counts.entries()]
    .map(([child, count]) => ({
      command: CliHelpCommandLabel.make(`huly ${[...path, child].join(" ")}`),
      description:
        descriptions.get(child) ?? CliHelpDescription.make(`${count} ${count === 1 ? "command" : "commands"}`)
    }))
    .sort((left, right) => left.command.localeCompare(right.command))
}

const renderGroupHelp = (
  path: CliCommandPath,
  version: CliPackageVersion,
  width: CliHelpWidth
): Option.Option<RenderedCliHelp> => {
  const rows = groupRows(path)
  if (rows.length === 0) return Option.none()
  return Option.some(
    wrapHelp(
      CliHelpFragment.make(
        [
          `Huly CLI ${version}`,
          "",
          "Usage:",
          `  huly ${path.join(" ")} <command> [options]`,
          "",
          "Commands:",
          renderRows(rows, width),
          "",
          `Run \`huly ${path.join(" ")} <command> --help\` for more detail.`
        ].join("\n")
      ),
      width
    )
  )
}

const plainHelpDoc = (document: HelpDoc.HelpDoc): CliHelpFragment =>
  CliHelpFragment.make(stripVTControlCharacters(HelpDoc.toAnsiText(document)).trim())

const usageLines = (
  command: CommandDescriptor.Command<unknown>,
  path: CliCommandPath
): ReadonlyArray<CliHelpFragment> =>
  Usage.enumerate(CommandDescriptor.getUsage(command), CliConfig.defaultConfig).map((span) => {
    const usage = plainHelpDoc(HelpDoc.p(span))
    return CliHelpFragment.make(`  huly ${[...path.slice(0, LAST_ITEM_OFFSET), usage].join(" ")}`)
  })

const wrapLine = (line: CliHelpLine, width: CliHelpWidth): ReadonlyArray<CliHelpLine> => {
  if (line.length <= width) return [line]
  const sourceIndentation = line.length - line.trimStart().length
  const indentation = " ".repeat(Math.min(sourceIndentation, Math.max(0, width - 1)))
  const contentWidth = CliLayoutWidth.make(Math.max(1, width - indentation.length))
  return wrappedText(CliHelpFragment.make(line.trim()), contentWidth).map((part) =>
    CliHelpLine.make(`${indentation}${part}`)
  )
}

const wrapHelp = (help: CliHelpFragment, width: CliHelpWidth): RenderedCliHelp =>
  RenderedCliHelp.make(
    help
      .split("\n")
      .flatMap((line) => wrapLine(CliHelpLine.make(line), width))
      .join("\n")
  )

const renderLeafHelp = (
  path: CliCommandPath,
  version: CliPackageVersion,
  width: CliHelpWidth
): Option.Option<RenderedCliHelp> => {
  return Option.map(buildCommandDescriptorAtPath(path), (command) => {
    const help = CliHelpFragment.make(
      [
        `Huly CLI ${version}`,
        "",
        "Usage:",
        ...usageLines(command, path),
        "",
        plainHelpDoc(CommandDescriptor.getHelp(command, CliConfig.defaultConfig))
      ].join("\n")
    )
    return wrapHelp(help, width)
  })
}

export const renderCliHelp = ({ path, version, width }: CliHelpRequest): Option.Option<RenderedCliHelp> => {
  if (path.length === 0) return Option.some(renderProgressiveRootHelp(version, width))
  const leafHelp = renderLeafHelp(path, version, width)
  return Option.orElse(leafHelp, () => renderGroupHelp(path, version, width))
}
