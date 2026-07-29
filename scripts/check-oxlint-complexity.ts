import { Schema } from "effect"
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { NonNegativeInteger } from "../src/domain/schemas/shared.js"

const OxlintDiagnosticSchema = Schema.Struct({ code: Schema.String, filename: Schema.String })

const OxlintResultSchema = Schema.Struct({ diagnostics: Schema.Array(OxlintDiagnosticSchema) })

const SuppressionSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Struct({ complexity: Schema.Struct({ count: NonNegativeInteger }) })
})

const suppressionPath = "oxlint-complexity-suppressions.json"
const JSON_INDENT_SPACES = 2
const parseOxlintResult = Schema.decodeUnknownSync(Schema.parseJson(OxlintResultSchema))
const parseSuppressions = Schema.decodeUnknownSync(Schema.parseJson(SuppressionSchema))

const result = spawnSync(
  "pnpm",
  ["exec", "oxlint", "-c", "oxlint.complexity.json", "-f", "json", "src", "packages/huly-cli/src"],
  { encoding: "utf8" }
)

if (result.error !== undefined || (result.status !== 0 && result.status !== 1)) {
  throw result.error ?? new Error(result.stderr)
}

const counts = new Map<string, number>()
for (const diagnostic of parseOxlintResult(result.stdout).diagnostics) {
  if (diagnostic.code !== "eslint(complexity)") continue
  counts.set(diagnostic.filename, (counts.get(diagnostic.filename) ?? 0) + 1)
}

const sortedCounts = [...counts].sort(([left], [right]) => left.localeCompare(right))

if (process.argv.includes("--prune")) {
  const next = Object.fromEntries(sortedCounts.map(([filename, count]) => [filename, { complexity: { count } }]))
  writeFileSync(suppressionPath, `${JSON.stringify(next, undefined, JSON_INDENT_SPACES)}\n`)
  console.log(`Updated ${suppressionPath} with ${sortedCounts.length} files.`)
  process.exitCode = 0
} else {
  const suppressions = parseSuppressions(readFileSync(suppressionPath, "utf8"))
  const filenames = new Set([...Object.keys(suppressions), ...counts.keys()])
  const mismatches = [...filenames].flatMap((filename) => {
    const actual = counts.get(filename) ?? 0
    const expected = suppressions[filename]?.complexity.count ?? 0
    return actual === expected ? [] : [`${filename}: expected ${expected}, found ${actual}`]
  })

  if (mismatches.length > 0) {
    console.error(["Cyclomatic complexity suppressions are out of sync:", ...mismatches].join("\n"))
    process.exitCode = 1
  } else {
    console.log(`Cyclomatic complexity is within the recorded baseline for ${sortedCounts.length} files.`)
  }
}
