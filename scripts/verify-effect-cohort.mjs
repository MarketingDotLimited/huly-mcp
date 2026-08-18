import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

import { Schema } from "effect"

const EFFECT_COHORT_VERSION = "4.0.0-rc.109"
const TSGO_VERSION = "0.36.4"
const EFFECT_SOURCE_COMMIT = "ebcfcb45cb9ae1c1b9725598caa27ec2e8747657"
const EFFECT_PATCH = "patches/effect@4.0.0-rc.109.patch"
const EFFECT_PATCH_SHA256 = "cee4cc6ff9a18f3595c86fe47adf659c1563a8bf43cd9793f3b9ace0bebae2d6"
const EFFECT_OVERLAY_PATCH = "patches/effect-mcp-compatibility-overlay.patch"
const EFFECT_OVERLAY_SHA256 = "865b8534be9c1ad9da954e79c07d7640698c1f191bdcdc4efe69501fe9288fbb"

const requiredVersions = new Map([
  ["effect", EFFECT_COHORT_VERSION],
  ["@effect/platform-node", EFFECT_COHORT_VERSION],
  ["@effect/vitest", EFFECT_COHORT_VERSION],
  ["@effect/tsgo", TSGO_VERSION],
  ["vitest", "4.1.10"],
  ["@vitest/coverage-v8", "4.1.10"],
  ["ioredis", "5.11.1"]
])
const prohibitedPackages = new Set(["@effect/cli", "@effect/platform"])
const foundVersions = new Map()

const DependencySchema = Schema.suspend(() =>
  Schema.Struct({
    dependencies: Schema.optionalKey(Schema.Record(Schema.String, DependencySchema)),
    devDependencies: Schema.optionalKey(Schema.Record(Schema.String, DependencySchema)),
    optionalDependencies: Schema.optionalKey(Schema.Record(Schema.String, DependencySchema)),
    version: Schema.optionalKey(Schema.String)
  })
)
const InstalledProjectsSchema = Schema.Array(DependencySchema)
const EffectSourceSchema = Schema.Struct({
  repository: Schema.Literal("https://github.com/lloydrichards/open_effect.git"),
  branch: Schema.Literal("feat/v2026-07-28"),
  commit: Schema.Literal(EFFECT_SOURCE_COMMIT),
  basePackage: Schema.Literal(`effect@${EFFECT_COHORT_VERSION}`),
  patch: Schema.Literal(EFFECT_PATCH),
  patchSha256: Schema.Literal(EFFECT_PATCH_SHA256),
  compatibilityOverlayPatch: Schema.Literal(EFFECT_OVERLAY_PATCH),
  compatibilityOverlaySha256: Schema.Literal(EFFECT_OVERLAY_SHA256),
  compatibilityOverlay: Schema.Tuple([
    Schema.Literal("preserve historical tool schema and annotation projection for stateful adapters"),
    Schema.Literal("retain registered legacy tool-call behavior while modern calls enforce request visibility"),
    Schema.Literal("project canonical tool schemas to the modern object-root contract at the dated adapter boundary")
  ])
})

const effectSource = Schema.decodeUnknownSync(Schema.fromJsonString(EffectSourceSchema))(
  readFileSync(new URL("../patches/effect-mcp-source.json", import.meta.url), "utf8")
)
const patchBytes = readFileSync(new URL(`../${effectSource.patch}`, import.meta.url))
const patchSha256 = createHash("sha256").update(patchBytes).digest("hex")
if (patchSha256 !== effectSource.patchSha256) {
  throw new Error(`Effect MCP patch digest mismatch: expected ${effectSource.patchSha256}, found ${patchSha256}`)
}
const overlayBytes = readFileSync(new URL(`../${effectSource.compatibilityOverlayPatch}`, import.meta.url))
const overlaySha256 = createHash("sha256").update(overlayBytes).digest("hex")
if (overlaySha256 !== effectSource.compatibilityOverlaySha256) {
  throw new Error(
    `Effect MCP compatibility overlay digest mismatch: expected ${effectSource.compatibilityOverlaySha256}, found ${overlaySha256}`
  )
}

const recordDependency = (name, dependency) => {
  if (typeof dependency !== "object" || dependency === null) return

  if (requiredVersions.has(name) || prohibitedPackages.has(name) || name.startsWith("@effect/")) {
    const versions = foundVersions.get(name) ?? new Set()
    if (typeof dependency.version === "string") versions.add(dependency.version)
    foundVersions.set(name, versions)
  }

  visitPackage(dependency)
}

const visitPackage = (entry) => {
  if (typeof entry !== "object" || entry === null) return
  for (const [name, dependency] of Object.entries(entry.dependencies ?? {})) recordDependency(name, dependency)
  for (const [name, dependency] of Object.entries(entry.devDependencies ?? {})) recordDependency(name, dependency)
  for (const [name, dependency] of Object.entries(entry.optionalDependencies ?? {})) recordDependency(name, dependency)
}

const installedProjects = Schema.decodeUnknownSync(Schema.fromJsonString(InstalledProjectsSchema))(
  execFileSync("pnpm", ["list", "--recursive", "--depth", "Infinity", "--json"], { encoding: "utf8" })
)

for (const project of installedProjects) visitPackage(project)

const failures = []
for (const [name, expectedVersion] of requiredVersions) {
  const versions = foundVersions.get(name) ?? new Set()
  if (versions.size !== 1 || !versions.has(expectedVersion)) {
    failures.push(
      `${name}: expected only ${expectedVersion}, found ${[...versions].sort((left, right) => left.localeCompare(right)).join(", ") || "nothing"}`
    )
  }
}
for (const name of prohibitedPackages) {
  const versions = foundVersions.get(name) ?? new Set()
  if (versions.size > 0) {
    failures.push(
      `${name}: prohibited package found at ${[...versions].sort((left, right) => left.localeCompare(right)).join(", ")}`
    )
  }
}
for (const [name, versions] of foundVersions) {
  if (requiredVersions.has(name) || prohibitedPackages.has(name)) continue

  const expectedVersion = name.startsWith("@effect/tsgo-") ? TSGO_VERSION : EFFECT_COHORT_VERSION
  if (versions.size !== 1 || !versions.has(expectedVersion)) {
    failures.push(
      `${name}: expected only ${expectedVersion}, found ${[...versions].sort((left, right) => left.localeCompare(right)).join(", ") || "nothing"}`
    )
  }
}

if (failures.length > 0) throw new Error(`Effect dependency cohort mismatch:\n${failures.join("\n")}`)

const tsgoVersion = Schema.decodeUnknownSync(Schema.String)(
  execFileSync("pnpm", ["exec", "effect-tsgo", "--version"], { encoding: "utf8" }).trim()
)
if (tsgoVersion !== `tsgo v${TSGO_VERSION}`) {
  throw new Error(`Effect tsgo native startup mismatch: expected tsgo v${TSGO_VERSION}, found ${tsgoVersion}`)
}

process.stdout.write(
  `Verified selected Effect source ${effectSource.commit}, source patch ${effectSource.patchSha256}, compatibility overlay ${effectSource.compatibilityOverlaySha256}, exact ${EFFECT_COHORT_VERSION} dependency cohort, and native tsgo ${TSGO_VERSION} startup.\n`
)
