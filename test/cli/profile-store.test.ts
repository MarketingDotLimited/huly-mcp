import * as fs from "node:fs/promises"
import * as path from "node:path"

import { Effect, Redacted, Schema } from "effect"
import { afterEach, describe, expect, it } from "vitest"

import {
  cliProfilePaths,
  CliProfileSchema,
  makeCliProfileStore,
  parseProfileName,
  resolveCliConfiguration,
  storedToken
} from "../../packages/huly-cli/src/profile-store.js"

const temporaryDirectories: Array<string> = []

const temporaryStore = async () => {
  const directory = await fs.mkdtemp(path.join(process.cwd(), ".profile-store-test-"))
  temporaryDirectories.push(directory)
  const paths = cliProfilePaths("linux", { XDG_CONFIG_HOME: directory }, directory)
  return makeCliProfileStore(paths)
}

const profileName = (value: string) => Effect.runPromise(parseProfileName(value))

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { force: true, recursive: true }))
  )
})

describe("CLI profile store", () => {
  it("uses the documented platform-specific configuration directories", () => {
    expect(cliProfilePaths("win32", { APPDATA: "C:\\Config" }, "C:\\Home").directory).toBe("C:\\Config/huly")
    expect(cliProfilePaths("win32", {}, "C:\\Home").directory).toBe("C:\\Home/huly")
    expect(cliProfilePaths("darwin", {}, "/Users/agent").directory).toBe(
      "/Users/agent/Library/Application Support/huly"
    )
    expect(cliProfilePaths("linux", {}, "/home/agent").directory).toBe("/home/agent/.config/huly")
  })

  it("returns empty configuration when profile files do not exist", async () => {
    const store = await temporaryStore()

    expect(await Effect.runPromise(store.readProfiles())).toEqual({ version: 1, profiles: {} })
    expect(await Effect.runPromise(store.readCredentials())).toEqual({ version: 1, tokens: {} })
    expect(await Effect.runPromise(resolveCliConfiguration(store, {}))).toMatchObject({ auth: { method: "none" } })
  })

  it("resolves active profile values while giving each environment variable priority", async () => {
    const store = await temporaryStore()
    const work = await profileName("work")
    await Effect.runPromise(
      store.writeProfiles({
        version: 1,
        activeProfile: work,
        profiles: { [work]: { url: "https://profile.example", workspace: "profile-space", defaultProject: "CLI" } }
      })
    )
    await Effect.runPromise(store.writeCredentials({ version: 1, tokens: { [work]: storedToken("stored-token") } }))

    const resolved = await Effect.runPromise(
      resolveCliConfiguration(store, { HULY_URL: "https://environment.example", HULY_TOKEN: "environment-token" })
    )

    expect(resolved.url).toBe("https://environment.example")
    expect(resolved.workspace).toBe("profile-space")
    expect(resolved.auth.method).toBe("token")
    if (resolved.auth.method === "token") expect(Redacted.value(resolved.auth.token)).toBe("environment-token")
    expect(resolved.defaultProject).toBe("CLI")
    expect(resolved.profile).toBe("work")
  })

  it("writes configuration and tokens with restrictive permissions without persisting passwords", async () => {
    const store = await temporaryStore()
    const personal = await profileName("personal")
    await Effect.runPromise(
      store.writeProfiles({
        version: 1,
        activeProfile: personal,
        profiles: { [personal]: { url: "http://localhost:8087", workspace: "ws" } }
      })
    )
    await Effect.runPromise(store.writeCredentials({ version: 1, tokens: { [personal]: storedToken("saved-token") } }))

    const profileMode = (await fs.stat(store.paths.profiles)).mode & 0o777
    const credentialMode = (await fs.stat(store.paths.credentials)).mode & 0o777
    const credentialText = await fs.readFile(store.paths.credentials, "utf8")

    expect(profileMode).toBe(0o600)
    expect(credentialMode).toBe(0o600)
    expect(credentialText).toContain("saved-token")
    expect(credentialText.toLowerCase()).not.toContain("password")
  })

  it("returns an actionable typed failure for malformed files", async () => {
    const store = await temporaryStore()
    await fs.mkdir(store.paths.directory, { recursive: true })
    await fs.writeFile(store.paths.profiles, "{not-json", "utf8")

    const exit = await Effect.runPromiseExit(store.readProfiles())

    expect(exit.toString()).toContain("Malformed JSON")
    expect(exit.toString()).toContain(store.paths.profiles)
  })

  it("rejects well-formed JSON that violates the profile schema", async () => {
    const store = await temporaryStore()
    await fs.mkdir(store.paths.directory, { recursive: true })
    await fs.writeFile(store.paths.profiles, JSON.stringify({ version: 1, profiles: { bad: { url: "::" } } }))

    const exit = await Effect.runPromiseExit(store.readProfiles())

    expect(exit.toString()).toContain("Invalid Huly CLI configuration")
  })

  it("reports the URL refinement message at the schema boundary", async () => {
    const exit = await Effect.runPromiseExit(
      Schema.decodeUnknown(CliProfileSchema)({ url: "::", workspace: "workspace" })
    )

    expect(exit.toString()).toContain("Expected an http or https URL")
  })

  it("returns a typed integration failure when secure configuration cannot be written", async () => {
    const store = await temporaryStore()
    await fs.writeFile(store.paths.directory, "blocks-directory-creation")

    const exit = await Effect.runPromiseExit(store.writeProfiles({ version: 1, profiles: {} }))

    expect(exit.toString()).toContain("Cannot write")
  })

  it("returns a typed integration failure when configuration cannot be read", async () => {
    const store = await temporaryStore()
    await fs.mkdir(store.paths.profiles, { recursive: true })

    const exit = await Effect.runPromiseExit(store.readProfiles())

    expect(exit.toString()).toContain("Cannot read")
  })

  it("wraps stored tokens as redacted values", () => {
    expect(Redacted.value(storedToken("secret-token"))).toBe("secret-token")
  })

  it("preserves password-auth environment values without writing them", async () => {
    const store = await temporaryStore()
    const resolved = await Effect.runPromise(
      resolveCliConfiguration(store, {
        HULY_CONNECTION_TIMEOUT: "5000",
        HULY_EMAIL: "agent@example.com",
        HULY_PASSWORD: "ephemeral",
        HULY_WORKSPACE: "workspace"
      })
    )

    expect(resolved.connectionTimeout).toBe("5000")
    expect(resolved.workspace).toBe("workspace")
    expect(resolved.auth.method).toBe("password")
    if (resolved.auth.method === "password") {
      expect(resolved.auth.email).toBe("agent@example.com")
      expect(resolved.auth.password === undefined ? undefined : Redacted.value(resolved.auth.password)).toBe(
        "ephemeral"
      )
    }
    expect(await Effect.runPromise(store.readCredentials())).toEqual({ version: 1, tokens: {} })
  })

  it("lets environment password authentication override a stored profile token", async () => {
    const store = await temporaryStore()
    const work = await profileName("work")
    await Effect.runPromise(
      store.writeProfiles({
        version: 1,
        activeProfile: work,
        profiles: { [work]: { url: "https://profile.example", workspace: "workspace" } }
      })
    )
    await Effect.runPromise(store.writeCredentials({ version: 1, tokens: { [work]: storedToken("stored") } }))

    const resolved = await Effect.runPromise(
      resolveCliConfiguration(store, { HULY_EMAIL: "agent@example.com", HULY_PASSWORD: "environment" })
    )

    expect(resolved.auth.method).toBe("password")
    if (resolved.auth.method === "password") {
      expect(resolved.auth.password === undefined ? undefined : Redacted.value(resolved.auth.password)).toBe(
        "environment"
      )
    }
  })

  it("preserves partial password authentication for downstream config diagnostics", async () => {
    const store = await temporaryStore()

    const emailOnly = await Effect.runPromise(resolveCliConfiguration(store, { HULY_EMAIL: "agent@example.com" }))
    const passwordOnly = await Effect.runPromise(resolveCliConfiguration(store, { HULY_PASSWORD: "password" }))

    expect(emailOnly.auth).toMatchObject({ method: "password", email: "agent@example.com" })
    expect(passwordOnly.auth.method).toBe("password")
    if (passwordOnly.auth.method === "password") {
      expect(passwordOnly.auth.password === undefined ? undefined : Redacted.value(passwordOnly.auth.password)).toBe(
        "password"
      )
    }
  })

  it("rejects an invalid environment URL at the resolved configuration boundary", async () => {
    const store = await temporaryStore()

    const exit = await Effect.runPromiseExit(resolveCliConfiguration(store, { HULY_URL: "not-a-url" }))

    expect(exit.toString()).toContain("Invalid resolved Huly CLI configuration")
  })

  it("atomically replaces a credentials symlink without writing through it", async () => {
    const store = await temporaryStore()
    const personal = await profileName("personal")
    await fs.mkdir(store.paths.directory, { recursive: true })
    const unrelated = path.join(store.paths.directory, "unrelated.json")
    await fs.writeFile(unrelated, "unchanged", { mode: 0o644 })
    await fs.symlink(unrelated, store.paths.credentials)

    await Effect.runPromise(store.writeCredentials({ version: 1, tokens: { [personal]: storedToken("saved-token") } }))

    expect(await fs.readFile(unrelated, "utf8")).toBe("unchanged")
    expect((await fs.lstat(store.paths.credentials)).isSymbolicLink()).toBe(false)
    expect((await fs.stat(store.paths.credentials)).mode & 0o777).toBe(0o600)
  })

  it("switches profiles by changing only the active profile name", async () => {
    const store = await temporaryStore()
    const first = await profileName("first")
    const second = await profileName("second")
    const profiles = {
      version: 1 as const,
      activeProfile: first,
      profiles: {
        [first]: { url: "https://first.example", workspace: "first" },
        [second]: { url: "https://second.example", workspace: "second" }
      }
    }
    await Effect.runPromise(store.writeProfiles(profiles))
    await Effect.runPromise(store.writeProfiles({ ...profiles, activeProfile: second }))

    const resolved = await Effect.runPromise(resolveCliConfiguration(store, {}))

    expect(resolved.profile).toBe("second")
    expect(resolved.url).toBe("https://second.example")
  })
})
