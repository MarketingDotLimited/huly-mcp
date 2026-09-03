import { describe, it, expect } from "vitest"
import { readFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const exec = promisify(execFile)

describe("Release Tooling Constraints", () => {
  it("scripts pass bash syntax check", async () => {
    await exec("bash", ["-n", "scripts/local_release.sh"])
    await exec("bash", ["-n", "scripts/local_mdl_release.sh"])
  })

  it("standard local_release refuses -mdl and names scripts/local_mdl_release.sh before network operations", async () => {
    const content = await readFile("scripts/local_release.sh", "utf-8")

    const preflightIdx = content.indexOf(`"$initial_mcp_package_version" == *"-mdl."*`)
    const installIdx = content.indexOf(`CI=true pnpm install`)
    const npmWhoamiIdx = content.indexOf(`npm whoami`)

    expect(preflightIdx).toBeGreaterThan(0)
    expect(installIdx).toBeGreaterThan(preflightIdx)
    expect(npmWhoamiIdx).toBeGreaterThan(preflightIdx)

    expect(content.includes(`"$initial_mcp_package_version" == *"-mdl."*`)).toBe(true)
    expect(content.includes(`scripts/local_mdl_release.sh`)).toBe(true)
    expect(content.includes(`Refusing to run standard release for an mdl prerelease`)).toBe(true)
  })

  it("dedicated MDL script validates version regex, requires exact sequential predecessor tag, keeps CLI version equal to prior tag, rejects pending changesets", async () => {
    const content = await readFile("scripts/local_mdl_release.sh", "utf-8")
    // validates version regex
    expect(content.includes(`"$mcp_package_version" =~ ^0\\.50\\.0-mdl\\.([0-9]+)$`)).toBe(true)
    // exact sequential predecessor tag
    expect(content.includes(`current_mdl_num != prev_mdl_num + 1`)).toBe(true)
    // keeps CLI version equal to prior tag
    expect(content.includes(`cli_package_version" != "$expected_cli_version`)).toBe(true)
    // rejects pending changesets
    expect(content.includes(`if [[ -n "$pending_changeset" ]]; then`)).toBe(true)
    expect(content.includes(`MDL releases must not use changesets`)).toBe(true)
  })

  it("has no npm publish, changesets version/publish, CLI build/publish commands", async () => {
    const content = await readFile("scripts/local_mdl_release.sh", "utf-8")
    expect(content).not.toMatch(/npm publish/)
    expect(content).not.toMatch(/changesets publish/)
    expect(content).not.toMatch(/changesets version/)
    expect(content).not.toMatch(/build_cli_package/)
    expect(content).not.toMatch(/verify-cli-integration/)
  })

  it("ensures check-all, MCP bundle build, and verify-version occur before exact push/tag mutation lines", async () => {
    const content = await readFile("scripts/local_mdl_release.sh", "utf-8")
    const checkAllIdx = content.indexOf("pnpm check-all")
    const esbuildIdx = content.indexOf("esbuild")
    const verifyIdx = content.indexOf("pnpm verify-version")

    // We want the MUTATING tag/push commands, not the read-only ones.
    const pushOriginIdx = content.indexOf('git push origin "$RELEASE_BRANCH"')
    const tagMutationIdx = content.indexOf('git tag "$release_tag"')

    expect(checkAllIdx).toBeGreaterThan(0)
    expect(esbuildIdx).toBeGreaterThan(checkAllIdx)
    expect(verifyIdx).toBeGreaterThan(esbuildIdx)

    expect(pushOriginIdx).toBeGreaterThan(verifyIdx)
    expect(tagMutationIdx).toBeGreaterThan(verifyIdx)
  })

  it("ensures exact push/tag mutation lines occur only after MDL_RELEASE_CONFIRM=true gate, and dry run exits before mutations", async () => {
    const content = await readFile("scripts/local_mdl_release.sh", "utf-8")

    const confirmGateIdx = content.indexOf('if [[ "${MDL_RELEASE_CONFIRM:-}" != "true" ]]; then')
    const exitZeroIdx = content.indexOf("exit 0", confirmGateIdx)

    const pushOriginIdx = content.indexOf('git push origin "$RELEASE_BRANCH"')
    const tagMutationIdx = content.indexOf('git tag "$release_tag"')

    expect(confirmGateIdx).toBeGreaterThan(0)
    expect(exitZeroIdx).toBeGreaterThan(confirmGateIdx)

    expect(pushOriginIdx).toBeGreaterThan(exitZeroIdx)
    expect(tagMutationIdx).toBeGreaterThan(exitZeroIdx)
  })
})
