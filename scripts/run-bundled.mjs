#!/usr/bin/env node

import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

import { build } from "esbuild"
import { Schema } from "effect"

const NODE_ARGUMENT_OFFSET = 2
const runnerArguments = Schema.decodeUnknownSync(Schema.Array(Schema.String))(process.argv.slice(NODE_ARGUMENT_OFFSET))
const [rawEntry, ...forwardedArguments] = runnerArguments
const entry = Schema.decodeUnknownSync(
  Schema.Trimmed.pipe(
    Schema.check(Schema.isNonEmpty()),
    Schema.annotate({ message: () => "Usage: run-bundled.mjs <entry.ts> [...args]" })
  )
)(rawEntry)

const directory = await mkdtemp(join(process.cwd(), ".huly-cli-script-"))
const output = join(directory, "script.cjs")

try {
  const result = await build({
    bundle: true,
    entryPoints: [resolve(entry)],
    external: ["ws"],
    format: "cjs",
    platform: "node",
    write: false
  })
  const bundled = result.outputFiles[0]
  if (bundled === undefined) throw new Error(`Bundling ${entry} produced no output.`)
  await writeFile(output, bundled.contents)
  process.argv = [process.argv[0] ?? "node", output, ...forwardedArguments]
  await import(pathToFileURL(output).href)
} finally {
  await rm(directory, { force: true, recursive: true })
}
