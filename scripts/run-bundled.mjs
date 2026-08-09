#!/usr/bin/env node

import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

import { build } from "esbuild"

const entry = process.argv[2]
if (entry === undefined) throw new Error("Usage: run-bundled.mjs <entry.ts> [...args]")

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
  process.argv = [process.argv[0] ?? "node", output, ...process.argv.slice(3)]
  await import(pathToFileURL(output).href)
} finally {
  await rm(directory, { force: true, recursive: true })
}
