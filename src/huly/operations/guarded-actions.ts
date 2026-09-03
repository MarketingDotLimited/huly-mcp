import { createHash, randomBytes } from "node:crypto"
import { mkdir, appendFile } from "node:fs/promises"
import { dirname } from "node:path"

import type { Doc, Ref, Space } from "@hcengineering/core"
import { Clock, Effect, Schema } from "effect"

import {
  type ExecuteHulyActionParams,
  type FindHulyDocumentsParams,
  type GuardedHulyAction,
  type PrepareHulyActionParams
} from "../../domain/schemas/guarded-actions.js"
import { NonEmptyString, ObjectClassName } from "../../domain/schemas/shared.js"
import { HulyClient } from "../client.js"
import { HulyError, type HulyDomainError } from "../errors.js"
import { getHulyClass } from "./sdk-discovery.js"
import {
  toClassRef,
  toDocData,
  toDocumentQuery,
  toDocumentUpdate,
  toMixinData,
  toMixinRef,
  toMixinUpdate,
  toRef
} from "./sdk-boundary.js"

type GuardedActionError = HulyDomainError

interface PreparedAction {
  readonly action: GuardedHulyAction
  readonly accountUuid: string
  readonly expiresAt: number
  readonly modifiedOn?: number
  readonly payloadHash: string
}

const APPROVAL_MINUTES = 5
const MILLISECONDS_PER_MINUTE = 60_000
const DEFAULT_RAW_FIND_LIMIT = 50
const APPROVAL_TOKEN_BYTES = 32
const APPROVAL_TTL_MS = APPROVAL_MINUTES * MILLISECONDS_PER_MINUTE
const approvals = new Map<string, PreparedAction>()
const SYSTEM_FIELDS = new Set(["_id", "_class", "space", "modifiedOn", "modifiedBy", "createdOn", "createdBy"])
const PROTECTED_CLASS_PREFIXES = ["account:", "migration:", "server:", "tx:", "core:class:"]
const PROTECTED_CLASSES = new Set([
  "core:class:Class",
  "core:class:Mixin",
  "core:class:Attribute",
  "core:class:Tx",
  "core:class:TxCUD",
  "contact:class:PersonAccount",
  "setting:class:Integration"
])
const PROTECTED_SPACES = new Set(["core:space:Model", "core:space:Configuration", "core:space:Space"])
const UPDATE_OPERATORS = new Set(["$inc", "$push", "$pull", "$unset"])
const JsonObjectSchema = Schema.Record(Schema.String, Schema.Json)

const canonicalize = (value: Schema.Json): Schema.Json =>
  Array.isArray(value)
    ? value.map((item) => canonicalize(Schema.decodeUnknownSync(Schema.Json)(item)))
    : typeof value === "object" && value !== null
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, canonicalize(item)])
        )
      : value

const hashJson = (value: Schema.Json): string =>
  createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex")

const actionJson = (action: GuardedHulyAction): Schema.Json =>
  Schema.decodeUnknownSync(Schema.Json)(JSON.parse(JSON.stringify(action)))

const assertAllowedClass = (classId: string): Effect.Effect<void, HulyError> =>
  PROTECTED_CLASSES.has(classId) || PROTECTED_CLASS_PREFIXES.some((prefix) => classId.startsWith(prefix))
    ? Effect.fail(new HulyError({ message: `Generic access to protected Huly class '${classId}' is denied` }))
    : Effect.void

const assertAllowedSpace = (space: string): Effect.Effect<void, HulyError> =>
  PROTECTED_SPACES.has(space)
    ? Effect.fail(new HulyError({ message: `Generic writes to protected Huly space '${space}' are denied` }))
    : Effect.void

const requestedFields = (payload: Readonly<Record<string, Schema.Json>>): ReadonlyArray<string> =>
  Object.entries(payload).flatMap(([key, value]) => {
    if (!UPDATE_OPERATORS.has(key)) return [key]
    if (typeof value !== "object" || value === null || Array.isArray(value)) return [key]
    return Object.keys(value)
  })

const validateFields = (
  classId: string,
  payload: Readonly<Record<string, Schema.Json>>,
  allowOperators: boolean
): Effect.Effect<void, GuardedActionError, HulyClient> =>
  Effect.gen(function* () {
    yield* assertAllowedClass(classId)
    const metadata = yield* getHulyClass({ class: ObjectClassName.make(classId), includeInheritedAttributes: true })
    const attributes = new Set(metadata.attributes.map((attribute) => String(attribute.name)))
    const unknown = requestedFields(payload).filter(
      (field) => !attributes.has(field) && !SYSTEM_FIELDS.has(field) && !(allowOperators && UPDATE_OPERATORS.has(field))
    )
    const immutable = requestedFields(payload).filter((field) => SYSTEM_FIELDS.has(field))
    if (unknown.length > 0) {
      return yield* new HulyError({ message: `Unknown fields for '${classId}': ${unknown.join(", ")}` })
    }
    if (immutable.length > 0) {
      return yield* new HulyError({ message: `System-managed fields cannot be mutated: ${immutable.join(", ")}` })
    }
  })

const findTarget = (
  client: HulyClient["Service"],
  classId: string,
  objectId: string
): Effect.Effect<Doc, GuardedActionError> =>
  client
    .findOne<Doc>(toClassRef<Doc>(classId), { _id: toRef<Doc>(objectId) })
    .pipe(
      Effect.flatMap((document) =>
        document === undefined
          ? Effect.fail(new HulyError({ message: `Document '${objectId}' of class '${classId}' not found` }))
          : Effect.succeed(document)
      )
    )

const auditPath = (): string => process.env["HULY_AUDIT_LOG_PATH"] ?? "/tmp/huly-mcp-audit/mutations.jsonl"

const writeAudit = (
  event: Readonly<Record<string, Schema.Json>>,
  failureMessage = "Mutation audit log is unavailable; action was not executed"
): Effect.Effect<string, HulyError> => {
  const auditHash = hashJson(event)
  const record = JSON.stringify({ ...event, auditHash }) + "\n"
  const path = auditPath()
  return Effect.tryPromise({
    try: async () => {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 })
      await appendFile(path, record, { encoding: "utf8", mode: 0o600 })
      return auditHash
    },
    catch: () => new HulyError({ message: failureMessage })
  })
}

const targetForAction = (
  client: HulyClient["Service"],
  action: GuardedHulyAction
): Effect.Effect<{ readonly modifiedOn?: number; readonly space?: string }, GuardedActionError> =>
  action.kind === "create"
    ? Effect.succeed({ space: action.space })
    : findTarget(client, action.kind === "apply_mixin" ? action.objectClass : action.class, action.objectId).pipe(
        Effect.map((target) => ({ modifiedOn: target.modifiedOn, space: target.space }))
      )

const validateAction = (action: GuardedHulyAction): Effect.Effect<void, GuardedActionError, HulyClient> => {
  switch (action.kind) {
    case "create":
      return assertAllowedSpace(action.space).pipe(Effect.andThen(validateFields(action.class, action.data, false)))
    case "update":
      return validateFields(action.class, action.operations, true)
    case "apply_mixin":
      return assertAllowedClass(action.objectClass).pipe(
        Effect.andThen(validateFields(action.mixin, action.data, true))
      )
    case "remove":
      return assertAllowedClass(action.class)
  }
}

const jsonValue = (value: unknown): Schema.Json => {
  const encoded = JSON.stringify(value, (_key, item: unknown) => (item === undefined ? null : item))
  return Schema.decodeUnknownSync(Schema.Json)(JSON.parse(encoded))
}

export const findHulyDocuments = (
  params: FindHulyDocumentsParams
): Effect.Effect<
  { readonly documents: ReadonlyArray<Record<string, Schema.Json>>; readonly returned: number },
  GuardedActionError,
  HulyClient
> =>
  Effect.gen(function* () {
    yield* assertAllowedClass(params.class)
    yield* getHulyClass({ class: params.class, includeInheritedAttributes: true })
    const client = yield* HulyClient
    const documents = yield* client.findAll<Doc>(toClassRef<Doc>(params.class), toDocumentQuery(params.query ?? {}), {
      limit: params.limit ?? DEFAULT_RAW_FIND_LIMIT
    })
    const projected = documents.map((document) => {
      const encoded = jsonValue(document)
      if (typeof encoded !== "object" || encoded === null || Array.isArray(encoded)) return {}
      const record = Schema.decodeUnknownSync(JsonObjectSchema)(encoded)
      if (params.projection === undefined) return record
      const included = new Set([...params.projection, "_id", "_class", "space", "modifiedOn"])
      return Object.fromEntries(Object.entries(record).filter(([key]) => included.has(key)))
    })
    return { documents: projected, returned: projected.length }
  })

export const prepareHulyAction = (
  params: PrepareHulyActionParams
): Effect.Effect<
  {
    readonly approvalToken: string
    readonly expiresAt: number
    readonly action: GuardedHulyAction
    readonly payloadHash: string
    readonly warning: string
  },
  GuardedActionError,
  HulyClient
> =>
  Effect.gen(function* () {
    yield* validateAction(params.action)
    const client = yield* HulyClient
    const target = yield* targetForAction(client, params.action)
    const expectedModifiedOn = "expectedModifiedOn" in params.action ? params.action.expectedModifiedOn : undefined
    if (expectedModifiedOn !== undefined && target.modifiedOn !== expectedModifiedOn) {
      return yield* new HulyError({ message: "Document modifiedOn does not match the requested precondition" })
    }
    const now = yield* Clock.currentTimeMillis
    const token = randomBytes(APPROVAL_TOKEN_BYTES).toString("base64url")
    const payloadHash = hashJson(actionJson(params.action))
    const prepared: PreparedAction = {
      action: params.action,
      accountUuid: String(client.getAccountUuid()),
      expiresAt: now + APPROVAL_TTL_MS,
      payloadHash,
      ...(target.modifiedOn === undefined ? {} : { modifiedOn: target.modifiedOn })
    }
    yield* writeAudit({
      event: "prepared",
      timestamp: now,
      accountUuid: prepared.accountUuid,
      actionKind: params.action.kind,
      payloadHash,
      expiresAt: prepared.expiresAt
    })
    approvals.set(token, prepared)
    return {
      approvalToken: NonEmptyString.make(token),
      expiresAt: prepared.expiresAt,
      action: params.action,
      payloadHash: NonEmptyString.make(payloadHash),
      warning: NonEmptyString.make(
        "Review the exact action above. execute_huly_action is single-use and cannot be undone."
      )
    }
  })

const executePrepared = (
  client: HulyClient["Service"],
  prepared: PreparedAction
): Effect.Effect<Ref<Doc>, GuardedActionError> => {
  const action = prepared.action
  switch (action.kind) {
    case "create":
      return client.createDoc(toClassRef<Doc>(action.class), toRef<Space>(action.space), toDocData(action.data))
    case "update":
      return Effect.gen(function* () {
        const target = yield* findTarget(client, action.class, action.objectId)
        if (prepared.modifiedOn !== target.modifiedOn)
          return yield* new HulyError({ message: "Document changed after preview" })
        yield* client.updateDoc(target._class, target.space, target._id, toDocumentUpdate(action.operations))
        return target._id
      })
    case "apply_mixin":
      return Effect.gen(function* () {
        const target = yield* findTarget(client, action.objectClass, action.objectId)
        if (prepared.modifiedOn !== target.modifiedOn)
          return yield* new HulyError({ message: "Document changed after preview" })
        const existing = yield* client.findOne<Doc>(toClassRef<Doc>(action.mixin), { _id: target._id })
        if (existing === undefined) {
          yield* client.createMixin<Doc, Doc>(
            target._id,
            target._class,
            target.space,
            toMixinRef<Doc>(action.mixin),
            toMixinData(action.data)
          )
        } else {
          yield* client.updateMixin<Doc, Doc>(
            target._id,
            target._class,
            target.space,
            toMixinRef<Doc>(action.mixin),
            toMixinUpdate(action.data)
          )
        }
        return target._id
      })
    case "remove":
      return Effect.gen(function* () {
        const target = yield* findTarget(client, action.class, action.objectId)
        if (prepared.modifiedOn !== target.modifiedOn)
          return yield* new HulyError({ message: "Document changed after preview" })
        yield* client.removeDoc(target._class, target.space, target._id)
        return target._id
      })
  }
}

export const executeHulyAction = (
  params: ExecuteHulyActionParams
): Effect.Effect<
  {
    readonly kind: GuardedHulyAction["kind"]
    readonly objectId: string
    readonly executed: boolean
    readonly auditHash: string
  },
  GuardedActionError,
  HulyClient
> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const prepared = approvals.get(params.approvalToken)
    approvals.delete(params.approvalToken)
    if (prepared === undefined)
      return yield* new HulyError({ message: "Approval token is invalid or has already been used" })
    const now = yield* Clock.currentTimeMillis
    if (prepared.expiresAt < now) return yield* new HulyError({ message: "Approval token has expired" })
    if (prepared.accountUuid !== String(client.getAccountUuid())) {
      return yield* new HulyError({ message: "Approval token belongs to a different Huly account" })
    }
    yield* writeAudit({
      event: "execution_started",
      timestamp: now,
      accountUuid: prepared.accountUuid,
      actionKind: prepared.action.kind,
      payloadHash: prepared.payloadHash
    })
    const objectId = yield* executePrepared(client, prepared)
    const auditHash = yield* writeAudit(
      {
        event: "executed",
        timestamp: now,
        accountUuid: prepared.accountUuid,
        actionKind: prepared.action.kind,
        objectId: String(objectId),
        payloadHash: prepared.payloadHash,
        outcome: "success"
      },
      "Mutation succeeded, but its completion audit record could not be written"
    )
    return {
      kind: prepared.action.kind,
      objectId: NonEmptyString.make(objectId),
      executed: true,
      auditHash: NonEmptyString.make(auditHash)
    }
  })
