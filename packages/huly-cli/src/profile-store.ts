import * as fs from "node:fs/promises"
import * as path from "node:path"

import { Either, Effect, Redacted, Schema } from "effect"

const CONFIG_DIRECTORY_MODE = 0o700
const CONFIG_FILE_MODE = 0o600
const JSON_INDENT_SPACES = 2

export const ProfileNameSchema = Schema.NonEmptyTrimmedString.pipe(
  Schema.pattern(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  Schema.brand("CliProfileName")
)
export type ProfileName = Schema.Schema.Type<typeof ProfileNameSchema>

const ProfileUrlSchema = Schema.String.pipe(
  Schema.filter(
    (value) => {
      try {
        const url = new URL(value)
        return url.protocol === "http:" || url.protocol === "https:"
      } catch {
        return false
      }
    },
    { message: () => "Expected an http or https URL." }
  )
)

export const CliProfileSchema = Schema.Struct({
  url: ProfileUrlSchema,
  workspace: Schema.NonEmptyTrimmedString,
  defaultProject: Schema.optionalWith(Schema.NonEmptyTrimmedString, { exact: true })
})
export type CliProfile = Schema.Schema.Type<typeof CliProfileSchema>

export const CliProfilesFileSchema = Schema.Struct({
  version: Schema.Literal(1),
  activeProfile: Schema.optionalWith(ProfileNameSchema, { exact: true }),
  profiles: Schema.Record({ key: ProfileNameSchema, value: CliProfileSchema })
})
export type CliProfilesFile = Schema.Schema.Type<typeof CliProfilesFileSchema>

export const CliCredentialsFileSchema = Schema.Struct({
  version: Schema.Literal(1),
  tokens: Schema.Record({ key: ProfileNameSchema, value: Schema.Redacted(Schema.NonEmptyTrimmedString) })
})
export type CliCredentialsFile = Schema.Schema.Type<typeof CliCredentialsFileSchema>

export class CliProfileStoreError extends Schema.TaggedError<CliProfileStoreError>()("CliProfileStoreError", {
  kind: Schema.Literal("input", "integration"),
  message: Schema.String
}) {}

class CliFileReadError extends Schema.TaggedError<CliFileReadError>()("CliFileReadError", {
  missing: Schema.Boolean
}) {}

export interface CliProfilePaths {
  readonly credentials: string
  readonly directory: string
  readonly profiles: string
}

const emptyProfiles = (): CliProfilesFile => ({ version: 1, profiles: {} })
const emptyCredentials = (): CliCredentialsFile => ({ version: 1, tokens: {} })

const nodeErrorSchema = Schema.Struct({ code: Schema.optionalWith(Schema.String, { exact: true }) })

const isMissingFile = (error: unknown): boolean => {
  const decoded = Schema.decodeUnknownEither(nodeErrorSchema)(error)
  return Either.isRight(decoded) && decoded.right.code === "ENOENT"
}

const configBaseDirectory = (
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
  homeDirectory: string
): string => {
  if (platform === "win32") return path.join(environment["APPDATA"] ?? homeDirectory, "huly")
  if (platform === "darwin") return path.join(homeDirectory, "Library", "Application Support", "huly")
  return path.join(environment["XDG_CONFIG_HOME"] ?? path.join(homeDirectory, ".config"), "huly")
}

export const cliProfilePaths = (
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
  homeDirectory: string
): CliProfilePaths => {
  const directory = configBaseDirectory(platform, environment, homeDirectory)
  return {
    credentials: path.join(directory, "credentials.json"),
    directory,
    profiles: path.join(directory, "profiles.json")
  }
}

const parseFile = <A, I>(
  filePath: string,
  text: string,
  schema: Schema.Schema<A, I>
): Effect.Effect<A, CliProfileStoreError> =>
  Effect.try({
    try: (): unknown => JSON.parse(text),
    catch: () => new CliProfileStoreError({ kind: "input", message: `Malformed JSON in ${filePath}.` })
  }).pipe(
    Effect.flatMap(Schema.decodeUnknown(schema)),
    Effect.mapError((error) =>
      error instanceof CliProfileStoreError
        ? error
        : new CliProfileStoreError({ kind: "input", message: `Invalid Huly CLI configuration in ${filePath}.` })
    )
  )

const readFile = <A, I>(
  filePath: string,
  schema: Schema.Schema<A, I>,
  whenMissing: () => A
): Effect.Effect<A, CliProfileStoreError> =>
  Effect.tryPromise({
    try: () => fs.readFile(filePath, "utf8"),
    catch: (error) => new CliFileReadError({ missing: isMissingFile(error) })
  }).pipe(
    Effect.flatMap((text) => parseFile(filePath, text, schema)),
    Effect.catchAll((error) =>
      error instanceof CliFileReadError && error.missing
        ? Effect.succeed(whenMissing())
        : error instanceof CliProfileStoreError
          ? Effect.fail(error)
          : Effect.fail(new CliProfileStoreError({ kind: "integration", message: `Cannot read ${filePath}.` }))
    )
  )

const writeFile = <A, I>(
  paths: CliProfilePaths,
  filePath: string,
  schema: Schema.Schema<A, I>,
  value: A
): Effect.Effect<void, CliProfileStoreError> =>
  Effect.gen(function* () {
    const writeError = () => new CliProfileStoreError({ kind: "integration", message: `Cannot write ${filePath}.` })
    const encoded = yield* Schema.encode(schema)(value).pipe(Effect.mapError(writeError))
    yield* Effect.tryPromise({
      try: async () => {
        await fs.mkdir(paths.directory, { recursive: true, mode: CONFIG_DIRECTORY_MODE })
        await fs.chmod(paths.directory, CONFIG_DIRECTORY_MODE)
      },
      catch: writeError
    })
    yield* Effect.acquireUseRelease(
      Effect.tryPromise({ try: () => fs.mkdtemp(path.join(paths.directory, ".huly-write-")), catch: writeError }),
      (temporaryDirectory) =>
        Effect.tryPromise({
          try: async () => {
            const temporaryFile = path.join(temporaryDirectory, path.basename(filePath))
            await fs.writeFile(temporaryFile, `${JSON.stringify(encoded, null, JSON_INDENT_SPACES)}\n`, {
              encoding: "utf8",
              flag: "wx",
              mode: CONFIG_FILE_MODE
            })
            await fs.rename(temporaryFile, filePath)
          },
          catch: writeError
        }),
      (temporaryDirectory) =>
        Effect.ignore(
          Effect.tryPromise({
            try: () => fs.rm(temporaryDirectory, { recursive: true, force: true }),
            catch: writeError
          })
        )
    )
  })

export interface CliProfileStore {
  readonly paths: CliProfilePaths
  readonly readCredentials: () => Effect.Effect<CliCredentialsFile, CliProfileStoreError>
  readonly readProfiles: () => Effect.Effect<CliProfilesFile, CliProfileStoreError>
  readonly writeCredentials: (credentials: CliCredentialsFile) => Effect.Effect<void, CliProfileStoreError>
  readonly writeProfiles: (profiles: CliProfilesFile) => Effect.Effect<void, CliProfileStoreError>
}

export const makeCliProfileStore = (paths: CliProfilePaths): CliProfileStore => ({
  paths,
  readCredentials: () => readFile(paths.credentials, CliCredentialsFileSchema, emptyCredentials),
  readProfiles: () => readFile(paths.profiles, CliProfilesFileSchema, emptyProfiles),
  writeCredentials: (credentials) => writeFile(paths, paths.credentials, CliCredentialsFileSchema, credentials),
  writeProfiles: (profiles) => writeFile(paths, paths.profiles, CliProfilesFileSchema, profiles)
})

export const CliConnectionAuthMethodSchema = Schema.Literal("token", "password")
export type CliConnectionAuthMethod = Schema.Schema.Type<typeof CliConnectionAuthMethodSchema>

const ResolvedCliAuthSchema = Schema.Union(
  Schema.Struct({ method: Schema.Literal("none") }),
  Schema.Struct({ method: Schema.Literal("token"), token: Schema.Redacted(Schema.NonEmptyTrimmedString) }),
  Schema.Struct({
    method: Schema.Literal("password"),
    credentialState: Schema.Literal("email-only"),
    email: Schema.NonEmptyTrimmedString
  }),
  Schema.Struct({
    method: Schema.Literal("password"),
    credentialState: Schema.Literal("password-only"),
    password: Schema.Redacted(Schema.NonEmptyString)
  }),
  Schema.Struct({
    method: Schema.Literal("password"),
    credentialState: Schema.Literal("complete"),
    email: Schema.NonEmptyTrimmedString,
    password: Schema.Redacted(Schema.NonEmptyString)
  })
)
export type ResolvedCliAuth = Schema.Schema.Type<typeof ResolvedCliAuthSchema>

export const ResolvedCliConfigurationSchema = Schema.Struct({
  auth: ResolvedCliAuthSchema,
  url: Schema.optionalWith(ProfileUrlSchema, { exact: true }),
  workspace: Schema.optionalWith(Schema.NonEmptyTrimmedString, { exact: true }),
  connectionTimeout: Schema.optionalWith(Schema.NonEmptyTrimmedString, { exact: true }),
  defaultProject: Schema.optionalWith(Schema.NonEmptyTrimmedString, { exact: true }),
  profile: Schema.optionalWith(ProfileNameSchema, { exact: true })
})
export type ResolvedCliConfiguration = Schema.Schema.Type<typeof ResolvedCliConfigurationSchema>

const environmentValue = (environment: NodeJS.ProcessEnv, name: string): string | undefined => {
  const value = environment[name]
  return value === undefined || value.length === 0 ? undefined : value
}

const resolvedAuth = (
  environment: NodeJS.ProcessEnv,
  token: Redacted.Redacted<string> | undefined
): ResolvedCliAuth => {
  const environmentToken = environmentValue(environment, "HULY_TOKEN")
  if (environmentToken !== undefined) return { method: "token", token: Redacted.make(environmentToken) }
  const email = environmentValue(environment, "HULY_EMAIL")
  const password = environmentValue(environment, "HULY_PASSWORD")
  if (email !== undefined && password !== undefined) {
    return { method: "password", credentialState: "complete", email, password: Redacted.make(password) }
  }
  if (email !== undefined) return { method: "password", credentialState: "email-only", email }
  if (password !== undefined) {
    return { method: "password", credentialState: "password-only", password: Redacted.make(password) }
  }
  return token === undefined ? { method: "none" } : { method: "token", token }
}

const resolvedEndpointFields = (environment: NodeJS.ProcessEnv, profile: CliProfile | undefined) => {
  const url = environmentValue(environment, "HULY_URL") ?? profile?.url
  const workspace = environmentValue(environment, "HULY_WORKSPACE") ?? profile?.workspace
  const connectionTimeout = environmentValue(environment, "HULY_CONNECTION_TIMEOUT")
  return {
    ...(url === undefined ? {} : { url }),
    ...(workspace === undefined ? {} : { workspace }),
    ...(connectionTimeout === undefined ? {} : { connectionTimeout })
  }
}

const resolvedProfileFields = (name: ProfileName | undefined, profile: CliProfile | undefined) => ({
  ...(profile?.defaultProject === undefined ? {} : { defaultProject: profile.defaultProject }),
  ...(name === undefined ? {} : { profile: name })
})

const tokenForProfile = (
  name: ProfileName | undefined,
  credentials: CliCredentialsFile
): Redacted.Redacted<string> | undefined => (name === undefined ? undefined : credentials.tokens[name])

const resolvedConfiguration = (
  name: ProfileName | undefined,
  profile: CliProfile | undefined,
  credentials: CliCredentialsFile,
  environment: NodeJS.ProcessEnv
): Effect.Effect<ResolvedCliConfiguration, CliProfileStoreError> => {
  return Schema.validate(ResolvedCliConfigurationSchema)({
    auth: resolvedAuth(environment, tokenForProfile(name, credentials)),
    ...resolvedEndpointFields(environment, profile),
    ...resolvedProfileFields(name, profile)
  }).pipe(
    Effect.mapError(
      () => new CliProfileStoreError({ kind: "input", message: "Invalid resolved Huly CLI configuration." })
    )
  )
}

export const resolveCliConfiguration = (
  store: CliProfileStore,
  environment: NodeJS.ProcessEnv
): Effect.Effect<ResolvedCliConfiguration, CliProfileStoreError> =>
  Effect.gen(function* () {
    const profiles = yield* store.readProfiles()
    const credentials = yield* store.readCredentials()
    const activeName = profiles.activeProfile
    const active = activeName === undefined ? undefined : profiles.profiles[activeName]
    return yield* resolvedConfiguration(activeName, active, credentials, environment)
  })

export const storedToken = (value: string): Redacted.Redacted<string> => Redacted.make(value)
export const parseProfileName = Schema.decodeUnknown(ProfileNameSchema)
