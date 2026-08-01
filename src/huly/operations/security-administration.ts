import type { Data, Doc, DocumentUpdate, Permission, Role, SpaceTypeDescriptor } from "@hcengineering/core"
import { generateId } from "@hcengineering/core"
import { getEmbeddedLabel } from "@hcengineering/platform"
import { Effect } from "effect"

import type {
  CreateHulyPermissionParams,
  CreateHulyPermissionResult,
  DeleteHulyPermissionParams,
  DeleteHulyPermissionResult,
  PermissionIdentifier,
  PermissionTransaction,
  UpdateHulyPermissionParams,
  UpdateHulyPermissionResult
} from "../../domain/schemas/security-administration.js"
import { PermissionIdentifier as PermissionIdentifierSchema } from "../../domain/schemas/security-administration.js"
import type { SpacePermissionSummary } from "../../domain/schemas/spaces.js"
import { NonEmptyString, ObjectClassName, PermissionId } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  PermissionIdentifierAmbiguousError,
  PermissionInUseError,
  PermissionKindUnsupportedError,
  PermissionLabelConflictError,
  PermissionNotFoundError,
  PermissionProtectedError
} from "../errors-security-administration.js"
import type { ModelClassAmbiguousError, ModelClassNotFoundError } from "../errors-model-administration.js"
import { hulyModelLabelTail } from "../huly-labels.js"
import { core } from "../huly-plugins.js"
import { hasNamespacedModelId } from "../security-metadata-constants.js"
import { hulyQuery } from "./query-helpers.js"
import { toClassRef } from "./sdk-boundary.js"
import { loadClasses, normalizeModelIdentifier, resolveModelClass } from "./model-administration-shared.js"

export type PermissionResolverError = PermissionIdentifierAmbiguousError | PermissionNotFoundError
type PermissionWriteError =
  | HulyClientError
  | PermissionResolverError
  | PermissionInUseError
  | PermissionKindUnsupportedError
  | PermissionLabelConflictError
  | PermissionProtectedError
  | ModelClassAmbiguousError
  | ModelClassNotFoundError

export const displaySecurityLabel = (value: Permission["label"]): NonEmptyString =>
  NonEmptyString.make(hulyModelLabelTail(value))

const optionalDisplayLabel = (value: unknown): NonEmptyString | undefined =>
  typeof value === "string" ? NonEmptyString.make(hulyModelLabelTail(value)) : undefined

const toSecurityPermissionSummary = (permission: Permission): SpacePermissionSummary => ({
  id: PermissionId.make(String(permission._id)),
  label: displaySecurityLabel(permission.label),
  ...(permission.description === undefined ? {} : { description: displaySecurityLabel(permission.description) }),
  ...(permission.scope === undefined ? {} : { scope: permission.scope }),
  ...(permission.objectClass === undefined
    ? {}
    : { objectClass: ObjectClassName.make(String(permission.objectClass)) }),
  ...(permission.txClass === undefined ? {} : { txClass: ObjectClassName.make(String(permission.txClass)) }),
  ...(permission.forbid === undefined ? {} : { forbid: permission.forbid })
})

const permissionTransactionClass = (transaction: PermissionTransaction): NonNullable<Permission["txClass"]> => {
  switch (transaction) {
    case "create":
      return core.class.TxCreateDoc
    case "update":
      return core.class.TxUpdateDoc
    case "remove":
      return core.class.TxRemoveDoc
    case "mixin":
      return core.class.TxMixin
  }
}

export const loadPermissions = (
  client: HulyClient["Type"]
): Effect.Effect<ReadonlyArray<Permission>, HulyClientError> =>
  client.findAll<Permission>(core.class.Permission, hulyQuery<Permission>({}))

const permissionMatches = (permission: Permission, identifier: PermissionIdentifier): boolean => {
  if (String(permission._id) === identifier) return true
  const target = normalizeModelIdentifier(identifier)
  return [String(permission.label), displaySecurityLabel(permission.label)].some(
    (label) => normalizeModelIdentifier(label) === target
  )
}

const matchingPermissions = (
  permissions: ReadonlyArray<Permission>,
  identifier: PermissionIdentifier
): ReadonlyArray<Permission> => permissions.filter((permission) => permissionMatches(permission, identifier))

export const resolvePermission = (
  permissions: ReadonlyArray<Permission>,
  identifier: PermissionIdentifier
): Effect.Effect<Permission, PermissionResolverError> => {
  const exact = permissions.find((permission) => String(permission._id) === identifier)
  if (exact !== undefined) return Effect.succeed(exact)
  const matches = matchingPermissions(permissions, identifier)
  if (matches.length === 0) return Effect.fail(new PermissionNotFoundError({ identifier }))
  if (matches.length > 1) {
    return Effect.fail(
      new PermissionIdentifierAmbiguousError({
        identifier,
        matches: matches.map((permission) => PermissionId.make(String(permission._id)))
      })
    )
  }
  const [match] = matches
  /* v8 ignore start -- the preceding non-empty branch proves this element exists */
  return match === undefined ? Effect.fail(new PermissionNotFoundError({ identifier })) : Effect.succeed(match)
  /* v8 ignore stop */
}

const isBuiltInPermission = (permission: Permission): boolean => hasNamespacedModelId(String(permission._id))

const assertBasePermission = (permission: Permission): Effect.Effect<void, PermissionKindUnsupportedError> =>
  permission._class === core.class.Permission
    ? Effect.void
    : Effect.fail(
        new PermissionKindUnsupportedError({
          permissionId: PermissionId.make(String(permission._id)),
          actualClass: ObjectClassName.make(String(permission._class))
        })
      )

const assertPermissionMutable = (permission: Permission): Effect.Effect<void, PermissionProtectedError> =>
  isBuiltInPermission(permission)
    ? Effect.fail(new PermissionProtectedError({ permissionId: PermissionId.make(String(permission._id)) }))
    : Effect.void

const permissionReferences = (
  client: HulyClient["Type"],
  permission: Permission
): Effect.Effect<ReadonlyArray<NonEmptyString>, HulyClientError> =>
  Effect.gen(function* () {
    const [roles, descriptors] = yield* Effect.all([
      client.findAll<Role>(core.class.Role, hulyQuery<Role>({ permissions: permission._id })),
      client.findAll<SpaceTypeDescriptor>(
        core.class.SpaceTypeDescriptor,
        hulyQuery<SpaceTypeDescriptor>({ availablePermissions: permission._id })
      )
    ])
    return [
      ...roles.map((role) => NonEmptyString.make(`role:${String(role._id)}`)),
      ...descriptors.map((descriptor) => NonEmptyString.make(`spaceTypeDescriptor:${String(descriptor._id)}`))
    ]
  })

const assertPermissionUnreferenced = (
  client: HulyClient["Type"],
  permission: Permission
): Effect.Effect<void, HulyClientError | PermissionInUseError> =>
  Effect.gen(function* () {
    const references = yield* permissionReferences(client, permission)
    if (references.length > 0) {
      return yield* new PermissionInUseError({ permissionId: PermissionId.make(String(permission._id)), references })
    }
  })

const samePermissionDefinition = (
  permission: Permission,
  params: CreateHulyPermissionParams,
  objectClass: Permission["objectClass"]
): boolean =>
  [
    displaySecurityLabel(permission.label) === params.label,
    permission.scope === params.scope,
    permission.objectClass === objectClass,
    permission.txClass ===
      (params.transaction === undefined ? undefined : permissionTransactionClass(params.transaction)),
    Boolean(permission.forbid) === Boolean(params.forbid),
    optionalDisplayLabel(permission.description) === params.description
  ].every(Boolean)

const resolvePermissionObjectClass = (
  client: HulyClient["Type"],
  identifier: CreateHulyPermissionParams["objectClass"] | null | undefined
): Effect.Effect<Permission["objectClass"], HulyClientError | ModelClassAmbiguousError | ModelClassNotFoundError> =>
  identifier === undefined || identifier === null
    ? Effect.succeed(undefined)
    : Effect.gen(function* () {
        const resolved = yield* resolveModelClass(yield* loadClasses(client), identifier)
        return toClassRef<Doc>(String(resolved._id))
      })

const createPermissionData = (
  params: CreateHulyPermissionParams,
  objectClass: Permission["objectClass"]
): Data<Permission> => ({
  label: getEmbeddedLabel(params.label),
  scope: params.scope,
  ...(objectClass === undefined ? {} : { objectClass }),
  ...(params.transaction === undefined ? {} : { txClass: permissionTransactionClass(params.transaction) }),
  ...(params.forbid === undefined ? {} : { forbid: params.forbid }),
  ...(params.description === undefined ? {} : { description: getEmbeddedLabel(params.description) })
})

export const createHulyPermission = (
  params: CreateHulyPermissionParams
): Effect.Effect<CreateHulyPermissionResult, PermissionWriteError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const [permissions, objectClass] = yield* Effect.all([
      loadPermissions(client),
      resolvePermissionObjectClass(client, params.objectClass)
    ])
    const identifier = PermissionIdentifierSchema.make(params.label)
    const matches = matchingPermissions(permissions, identifier)
    if (matches.length > 1) {
      return yield* new PermissionIdentifierAmbiguousError({
        identifier,
        matches: matches.map((permission) => PermissionId.make(String(permission._id)))
      })
    }
    const [existing] = matches
    if (existing !== undefined) {
      if (samePermissionDefinition(existing, params, objectClass)) {
        return { permission: toSecurityPermissionSummary(existing), created: false }
      }
      return yield* new PermissionLabelConflictError({
        label: params.label,
        existingPermissionId: PermissionId.make(String(existing._id))
      })
    }

    const permissionId = generateId<Permission>()
    const attributes = createPermissionData(params, objectClass)
    yield* client.createDoc(core.class.Permission, core.space.Model, attributes, permissionId)
    return {
      permission: toSecurityPermissionSummary({
        _id: permissionId,
        _class: core.class.Permission,
        space: core.space.Model,
        modifiedBy: client.getPrimarySocialId(),
        modifiedOn: 0,
        ...attributes
      }),
      created: true
    }
  })

const permissionUpdateOperations = (
  params: UpdateHulyPermissionParams,
  objectClass: Permission["objectClass"]
): DocumentUpdate<Permission> => {
  const direct: DocumentUpdate<Permission> = {
    ...permissionLabelUpdate(params),
    ...permissionScopeUpdate(params),
    ...permissionObjectClassUpdate(params, objectClass),
    ...permissionTransactionUpdate(params),
    ...permissionForbidUpdate(params),
    ...permissionDescriptionUpdate(params)
  }
  const unset = {
    ...(params.objectClass === null ? { objectClass: "" } : {}),
    ...(params.transaction === null ? { txClass: "" } : {}),
    ...(params.description === null ? { description: "" } : {})
  }
  return Object.keys(unset).length === 0 ? direct : { ...direct, $unset: unset }
}

const permissionLabelUpdate = (params: UpdateHulyPermissionParams): DocumentUpdate<Permission> =>
  params.label === undefined ? {} : { label: getEmbeddedLabel(params.label) }

const permissionScopeUpdate = (params: UpdateHulyPermissionParams): DocumentUpdate<Permission> =>
  params.scope === undefined ? {} : { scope: params.scope }

const permissionObjectClassUpdate = (
  params: UpdateHulyPermissionParams,
  objectClass: Permission["objectClass"]
): DocumentUpdate<Permission> =>
  params.objectClass === undefined || params.objectClass === null || objectClass === undefined ? {} : { objectClass }

const permissionTransactionUpdate = (params: UpdateHulyPermissionParams): DocumentUpdate<Permission> =>
  params.transaction === undefined || params.transaction === null
    ? {}
    : { txClass: permissionTransactionClass(params.transaction) }

const permissionForbidUpdate = (params: UpdateHulyPermissionParams): DocumentUpdate<Permission> =>
  params.forbid === undefined ? {} : { forbid: params.forbid }

const permissionDescriptionUpdate = (params: UpdateHulyPermissionParams): DocumentUpdate<Permission> =>
  params.description === undefined || params.description === null
    ? {}
    : { description: getEmbeddedLabel(params.description) }

interface UpdatedPermissionValues {
  readonly description: NonEmptyString | undefined
  readonly scope: Permission["scope"]
  readonly objectClass: Permission["objectClass"]
  readonly txClass: Permission["txClass"]
  readonly forbid: Permission["forbid"]
}

const updatedPermissionDescription = (
  permission: Permission,
  params: UpdateHulyPermissionParams
): NonEmptyString | undefined =>
  params.description === null ? undefined : (params.description ?? optionalDisplayLabel(permission.description))

const updatedPermissionObjectClass = (
  permission: Permission,
  params: UpdateHulyPermissionParams,
  objectClass: Permission["objectClass"]
): Permission["objectClass"] => (params.objectClass === null ? undefined : (objectClass ?? permission.objectClass))

const updatedPermissionTransactionClass = (
  permission: Permission,
  params: UpdateHulyPermissionParams
): Permission["txClass"] => {
  if (params.transaction === null) return undefined
  return params.transaction === undefined ? permission.txClass : permissionTransactionClass(params.transaction)
}

const resolveUpdatedPermissionValues = (
  permission: Permission,
  params: UpdateHulyPermissionParams,
  objectClass: Permission["objectClass"]
): UpdatedPermissionValues => ({
  description: updatedPermissionDescription(permission, params),
  scope: params.scope ?? permission.scope,
  objectClass: updatedPermissionObjectClass(permission, params, objectClass),
  txClass: updatedPermissionTransactionClass(permission, params),
  forbid: params.forbid ?? permission.forbid
})

const updatedPermissionOptionalSummary = (
  values: UpdatedPermissionValues
): Omit<SpacePermissionSummary, "id" | "label"> => ({
  ...(values.description === undefined ? {} : { description: values.description }),
  ...(values.scope === undefined ? {} : { scope: values.scope }),
  ...(values.objectClass === undefined ? {} : { objectClass: ObjectClassName.make(String(values.objectClass)) }),
  ...(values.txClass === undefined ? {} : { txClass: ObjectClassName.make(String(values.txClass)) }),
  ...(values.forbid === undefined ? {} : { forbid: values.forbid })
})

const updatedPermissionSummary = (
  permission: Permission,
  params: UpdateHulyPermissionParams,
  objectClass: Permission["objectClass"]
): SpacePermissionSummary => {
  return {
    id: PermissionId.make(String(permission._id)),
    label: params.label ?? displaySecurityLabel(permission.label),
    ...updatedPermissionOptionalSummary(resolveUpdatedPermissionValues(permission, params, objectClass))
  }
}

const changesPermissionSemantics = (params: UpdateHulyPermissionParams): boolean =>
  [params.scope, params.objectClass, params.transaction, params.forbid].some((value) => value !== undefined)

export const updateHulyPermission = (
  params: UpdateHulyPermissionParams
): Effect.Effect<UpdateHulyPermissionResult, PermissionWriteError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const current = yield* resolvePermission(yield* loadPermissions(client), params.permission)
    yield* assertBasePermission(current)
    yield* assertPermissionMutable(current)
    if (changesPermissionSemantics(params)) yield* assertPermissionUnreferenced(client, current)
    const objectClass = yield* resolvePermissionObjectClass(client, params.objectClass)
    yield* client.updateDoc(current._class, current.space, current._id, permissionUpdateOperations(params, objectClass))
    return { permission: updatedPermissionSummary(current, params, objectClass), updated: true }
  })

export const deleteHulyPermission = (
  params: DeleteHulyPermissionParams
): Effect.Effect<DeleteHulyPermissionResult, PermissionWriteError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const current = yield* resolvePermission(yield* loadPermissions(client), params.permission)
    yield* assertBasePermission(current)
    yield* assertPermissionMutable(current)
    yield* assertPermissionUnreferenced(client, current)
    yield* client.removeDoc(current._class, current.space, current._id)
    return { permissionId: PermissionId.make(String(current._id)), deleted: true }
  })
