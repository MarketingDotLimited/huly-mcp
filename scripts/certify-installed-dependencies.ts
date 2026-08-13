import { readFileSync } from "node:fs"

import { Schema } from "effect"

const DependencyGraphInputSchema = Schema.Tuple([
  Schema.NonEmptyString,
  Schema.Literals(["@firfi/huly-mcp", "@firfi/huly-cli"])
])
const PackageNameSchema = Schema.NonEmptyString
const parsePackageNames = Schema.decodeUnknownSync(Schema.Array(PackageNameSchema))

// Recursive Schema.suspend needs an explicit fixed-point shape; the schema below
// remains the sole parser for this npm boundary and constrains that shape.
interface DependencyNode {
  readonly dependencies?: Readonly<Record<string, DependencyNode>>
}

const DependencyNodeSchema: Schema.Codec<DependencyNode> = Schema.Struct({
  dependencies: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.suspend((): Schema.Codec<DependencyNode> => DependencyNodeSchema)
    )
  )
})
const DependencyGraphSchema = Schema.fromJsonString(DependencyNodeSchema)

const collectPackageNames = (value: DependencyNode, names: Set<string>): void => {
  if (value.dependencies === undefined) return
  for (const [name, dependency] of Object.entries(value.dependencies)) {
    names.add(Schema.decodeUnknownSync(PackageNameSchema)(name))
    collectPackageNames(dependency, names)
  }
}

export const certifyInstalledDependencyGraph = (graphJson: string, expectedPackage: string): ReadonlyArray<string> => {
  const graph = Schema.decodeUnknownSync(DependencyGraphSchema)(graphJson)
  const names = new Set<string>()
  collectPackageNames(graph, names)
  const parsedNames = parsePackageNames([...names].sort())
  if (!names.has(expectedPackage)) throw new Error(`Resolved graph does not contain ${expectedPackage}.`)
  if (!names.has("ws")) throw new Error("Resolved graph does not contain the required ws runtime dependency.")
  if (parsedNames.some((name) => name === "effect" || name.startsWith("@effect/"))) {
    throw new Error("Resolved consumer graph contains an unexpected external Effect package.")
  }
  return parsedNames
}

const runCommand = (): void => {
  const processArgumentOffset = 2
  const [graphPath, expectedPackage] = Schema.decodeUnknownSync(DependencyGraphInputSchema)(
    process.argv.slice(processArgumentOffset)
  )
  certifyInstalledDependencyGraph(readFileSync(graphPath, "utf8"), expectedPackage)
  process.stdout.write(`Resolved ${expectedPackage} graph verified without external Effect packages; ws is present.\n`)
}

if (process.env["VITEST"] === undefined) runCommand()
