import { builtinModules } from "node:module"
import { readFileSync } from "node:fs"

import { Schema } from "effect"

const CliPackageJsonSchema = Schema.Struct({
  bin: Schema.Struct({ huly: Schema.Literal("./dist/index.cjs") }),
  dependencies: Schema.Record({ key: Schema.String, value: Schema.String }),
  files: Schema.Array(Schema.String),
  main: Schema.Literal("./dist/index.cjs"),
  name: Schema.Literal("@firfi/huly-cli")
})

const cliPackageJson = Schema.decodeUnknownSync(Schema.parseJson(CliPackageJsonSchema))(
  readFileSync("packages/huly-cli/package.json", "utf8")
)
const bundle = readFileSync("packages/huly-cli/dist/index.cjs", "utf8")
const requirePattern = /require\("([^".][^"]*)"\)/g
const requiredModules = new Set(
  Array.from(bundle.matchAll(requirePattern), (match) => match[1]).filter((name): name is string => name !== undefined)
)
const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)])
const externalModules = [...requiredModules].filter((name) => !name.startsWith("node:") && !builtins.has(name)).sort()
const undeclared = externalModules.filter((name) => cliPackageJson.dependencies[name] === undefined)

const errors = [
  cliPackageJson.files.length === 1 && cliPackageJson.files[0] === "dist/index.cjs"
    ? undefined
    : "CLI package files must contain only dist/index.cjs.",
  undeclared.length === 0 ? undefined : `CLI bundle has undeclared runtime dependencies: ${undeclared.join(", ")}.`
].filter((message) => message !== undefined)

if (errors.length > 0) {
  for (const error of errors) console.error(error)
  process.exitCode = 1
} else {
  console.log(
    `CLI package closure verified: bundled shared registry plus ${externalModules.length} declared external runtime dependency.`
  )
}
