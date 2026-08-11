import { Effect, type Redacted, Schema } from "effect"

import {
  type CliProfile,
  CliProfileSchema,
  type CliProfilesFile,
  type CliProfileStore,
  CliProfileStoreError,
  type ProfileName,
  type ResolvedCliConfiguration,
  resolveCliConfiguration
} from "./profile-store.js"

export const CliAuthStatusSchema = Schema.Struct({
  authenticated: Schema.Boolean,
  authMethod: Schema.Literal("token", "password", "none"),
  profile: Schema.optionalWith(Schema.String, { exact: true }),
  url: Schema.optionalWith(Schema.String, { exact: true }),
  workspace: Schema.optionalWith(Schema.String, { exact: true }),
  defaultProject: Schema.optionalWith(Schema.String, { exact: true }),
  sources: Schema.Struct({
    url: Schema.Literal("environment", "profile", "missing"),
    workspace: Schema.Literal("environment", "profile", "missing"),
    authentication: Schema.Literal("environment", "profile", "missing")
  })
})
export type CliAuthStatus = Schema.Schema.Type<typeof CliAuthStatusSchema>

export const CliProfilePatchSchema = Schema.Struct({
  defaultProject: Schema.optionalWith(Schema.Union(Schema.NonEmptyTrimmedString, Schema.Null), { exact: true }),
  url: Schema.optionalWith(CliProfileSchema.fields.url, { exact: true }),
  workspace: Schema.optionalWith(CliProfileSchema.fields.workspace, { exact: true })
})
export type CliProfilePatch = Schema.Schema.Type<typeof CliProfilePatchSchema>

const missingProfile = (name: ProfileName): CliProfileStoreError =>
  new CliProfileStoreError({ kind: "input", message: `Huly CLI profile '${name}' does not exist.` })

const existingProfile = (name: ProfileName): CliProfileStoreError =>
  new CliProfileStoreError({ kind: "input", message: `Huly CLI profile '${name}' already exists.` })

const withActiveProfile = (profiles: CliProfilesFile, name: ProfileName, profile: CliProfile): CliProfilesFile => ({
  ...profiles,
  activeProfile: profiles.activeProfile ?? name,
  profiles: { ...profiles.profiles, [name]: profile }
})

export const createProfile = (
  store: CliProfileStore,
  name: ProfileName,
  profile: CliProfile
): Effect.Effect<void, CliProfileStoreError> =>
  Effect.gen(function* () {
    const profiles = yield* store.readProfiles()
    if (profiles.profiles[name] !== undefined) return yield* existingProfile(name)
    yield* store.writeProfiles(withActiveProfile(profiles, name, profile))
  })

const applyProfilePatch = (profile: CliProfile, patch: CliProfilePatch): CliProfile => ({
  url: patch.url ?? profile.url,
  workspace: patch.workspace ?? profile.workspace,
  ...(patch.defaultProject === null
    ? {}
    : patch.defaultProject === undefined
      ? profile.defaultProject === undefined
        ? {}
        : { defaultProject: profile.defaultProject }
      : { defaultProject: patch.defaultProject })
})

export const updateProfile = (
  store: CliProfileStore,
  name: ProfileName,
  patch: CliProfilePatch
): Effect.Effect<void, CliProfileStoreError> =>
  Effect.gen(function* () {
    const profiles = yield* store.readProfiles()
    const current = profiles.profiles[name]
    if (current === undefined) return yield* missingProfile(name)
    const updated = yield* Schema.decodeUnknown(CliProfileSchema)(applyProfilePatch(current, patch)).pipe(
      Effect.mapError(
        () => new CliProfileStoreError({ kind: "input", message: `Huly CLI profile '${name}' is invalid.` })
      )
    )
    yield* store.writeProfiles({ ...profiles, profiles: { ...profiles.profiles, [name]: updated } })
  })

export const selectProfile = (store: CliProfileStore, name: ProfileName): Effect.Effect<void, CliProfileStoreError> =>
  Effect.gen(function* () {
    const profiles = yield* store.readProfiles()
    if (profiles.profiles[name] === undefined) return yield* missingProfile(name)
    yield* store.writeProfiles({ ...profiles, activeProfile: name })
  })

export const saveLogin = (
  store: CliProfileStore,
  name: ProfileName,
  profile: CliProfile,
  token: Redacted.Redacted<string>
): Effect.Effect<void, CliProfileStoreError> =>
  Effect.gen(function* () {
    const profiles = yield* store.readProfiles()
    const credentials = yield* store.readCredentials()
    yield* store.writeProfiles({ ...withActiveProfile(profiles, name, profile), activeProfile: name })
    yield* store.writeCredentials({ ...credentials, tokens: { ...credentials.tokens, [name]: token } })
  })

export const logoutProfile = (
  store: CliProfileStore,
  requestedName?: ProfileName
): Effect.Effect<ProfileName, CliProfileStoreError> =>
  Effect.gen(function* () {
    const profiles = yield* store.readProfiles()
    const name = requestedName ?? profiles.activeProfile
    if (name === undefined || profiles.profiles[name] === undefined) {
      return yield* new CliProfileStoreError({ kind: "input", message: "No active Huly CLI profile." })
    }
    const credentials = yield* store.readCredentials()
    const { [name]: _removed, ...tokens } = credentials.tokens
    yield* store.writeCredentials({ ...credentials, tokens })
    return name
  })

const source = (
  environmentValue: string | undefined,
  profileValue: string | undefined
): CliAuthStatus["sources"]["url"] =>
  environmentValue !== undefined ? "environment" : profileValue !== undefined ? "profile" : "missing"

const authMethod = (resolved: ResolvedCliConfiguration): CliAuthStatus["authMethod"] => {
  if (resolved.auth.method === "token") return "token"
  if (resolved.auth.method === "none") return "none"
  return resolved.auth.email !== undefined && resolved.auth.password !== undefined ? "password" : "none"
}

const optionalStatusFields = (resolved: ResolvedCliConfiguration) => {
  return {
    ...(resolved.profile === undefined ? {} : { profile: resolved.profile }),
    ...(resolved.url === undefined ? {} : { url: resolved.url }),
    ...(resolved.workspace === undefined ? {} : { workspace: resolved.workspace }),
    ...(resolved.defaultProject === undefined ? {} : { defaultProject: resolved.defaultProject })
  }
}

const makeAuthStatus = (
  profiles: CliProfilesFile,
  resolved: ResolvedCliConfiguration,
  environment: NodeJS.ProcessEnv
): CliAuthStatus => {
  const profile = profiles.activeProfile === undefined ? undefined : profiles.profiles[profiles.activeProfile]
  const method = authMethod(resolved)
  return Schema.decodeUnknownSync(CliAuthStatusSchema)({
    authenticated: method !== "none",
    authMethod: method,
    ...optionalStatusFields(resolved),
    sources: {
      url: source(environment["HULY_URL"], profile?.url),
      workspace: source(environment["HULY_WORKSPACE"], profile?.workspace),
      authentication: source(
        environment["HULY_TOKEN"] ?? environment["HULY_EMAIL"] ?? environment["HULY_PASSWORD"],
        profiles.activeProfile === undefined || resolved.auth.method !== "token" ? undefined : profiles.activeProfile
      )
    }
  })
}

export const getAuthStatus = (
  store: CliProfileStore,
  environment: NodeJS.ProcessEnv
): Effect.Effect<CliAuthStatus, CliProfileStoreError> =>
  Effect.gen(function* () {
    const profiles = yield* store.readProfiles()
    const resolved = yield* resolveCliConfiguration(store, environment)
    return makeAuthStatus(profiles, resolved, environment)
  })
